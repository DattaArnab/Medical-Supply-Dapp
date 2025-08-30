import { useState, useEffect } from 'react'
import { Contract, BrowserProvider } from 'ethers'
import {abi, contract_address} from './Cert.json'
import RoleGranter from './RoleGranter'
import { QRCodeSVG } from 'qrcode.react'
import IPFSService from './services/IPFSService'
import QRCode from 'qrcode'
import { useTokenCounter } from './hooks/useTokenCounter'
import Logo from './assets/Logo.png'
import './App.css'

function App() {
  const [account, setAccount] = useState('');
  const [contract, setContract] = useState(null);
  const [userRoles, setUserRoles] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(false);
  const [mintLoading, setMintLoading] = useState(false);
  const [transferLoading, setTransferLoading] = useState(false);
  const [drugs, setDrugs] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [claims, setClaims] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [mintedQrData, setMintedQrData] = useState(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  
  // Use the token counter hook
  const { nextTokenId, incrementTokenId } = useTokenCounter(contract);
  
  const provider = new BrowserProvider(window.ethereum);
  const ipfsService = new IPFSService();

  const connectWallet = async () => {
    try {
      setLoading(true);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      setAccount(address);
      
      // Initialize contract
      const contractInstance = new Contract(contract_address, abi, signer);
      setContract(contractInstance);
      
      // Check user roles
      await checkUserRoles(contractInstance, address);
      
      // Additional admin check for debugging
      const adminRole = await contractInstance.DEFAULT_ADMIN_ROLE();
      const isAdmin = await contractInstance.hasRole(adminRole, address);
      console.log(`Admin role check for ${address}:`, isAdmin);
      console.log('Admin role hash:', adminRole);
      
      alert(`Connected to Metamask ${address}`);
    } catch (error) {
      console.error("Failed to connect wallet:", error);
      alert("Failed to connect wallet");
    } finally {
      setLoading(false);
    }
  }

  const checkUserRoles = async (contractInstance, address) => {
    try {
      const roles = [];
      
      // Check all possible roles
      const roleChecks = [
        { name: 'Admin', hash: await contractInstance.DEFAULT_ADMIN_ROLE() },
        { name: 'Manufacturer', hash: await contractInstance.MFG_ROLE() },
        { name: 'Intermediary', hash: await contractInstance.INT_ROLE() },
        { name: 'Pharmacist', hash: await contractInstance.PHAR_ROLE() },
        { name: 'Doctor', hash: await contractInstance.DOC_ROLE() },
        { name: 'Patient', hash: await contractInstance.PAT_ROLE() },
        { name: 'Insurer', hash: await contractInstance.INS_ROLE() }
      ];

      console.log('Checking roles for address:', address);
      
      for (let role of roleChecks) {
        const hasRole = await contractInstance.hasRole(role.hash, address);
        console.log(`Role ${role.name} (${role.hash}):`, hasRole);
        if (hasRole) {
          roles.push(role.name);
        }
      }
      
      console.log('Final user roles:', roles);
      setUserRoles(roles);
    } catch (error) {
      console.error("Failed to check roles:", error);
    }
  };

  const createQRCode = (tokenId, medicineId, drugName, expirySeconds) => {
    return new Promise((resolve, reject) => {
      // Calculate expiry date from seconds
      const expiryDate = new Date(Date.now() + (expirySeconds * 1000));
      
      const data = {
        tokenId: tokenId.toString(),
        drugName: drugName,
        medicineId: medicineId.toString(),
        expiryDate: expiryDate.toISOString(),
        contractAddress: contract_address,
        network: "sepolia"
      };
      const canvas = document.createElement('canvas');
      
      QRCode.toCanvas(canvas, JSON.stringify(data), { width: 256 }, (error) => {
        if (error) {
          console.error('Error generating QR code:', error);
          reject(error);
        } else {
          canvas.toBlob(resolve, 'image/png');
        }
      });
    });
  };

  const registerAsPatient = async () => {
    if (!contract) return;
    try {
      setLoading(true);
      const tx = await contract.grantPat(account);
      await tx.wait();
      alert('Registered as Patient!');
      await checkUserRoles(contract, account);
    } catch (error) {
      console.error("Failed to register as patient:", error);
      alert("Failed to register as patient");
    } finally {
      setLoading(false);
    }
  }

  const mintDrug = async (medicineId, name, expiry, uri) => {
    if (!contract) return;
    try {
      setMintLoading(true);
      
      // Test IPFS connection first
      console.log('Testing IPFS connection...');
      const connectionTest = await ipfsService.testConnection();
      if (!connectionTest) {
        throw new Error('Failed to connect to IPFS service. Please check your API credentials.');
      }
      console.log('IPFS connection successful!');
      
      // Step 1: Use the next token ID from the hook
      console.log('Next Token ID will be:', nextTokenId.toString());
      
      // Step 2: Generate QR code for the medicine with correct token ID
      console.log('Step 2: Generating QR code for token ID:', nextTokenId.toString());
      const qrBlob = await createQRCode(nextTokenId, medicineId, name, expiry);
      
      // Step 3: Upload QR image to IPFS using JWT token
      const qrFile = new File([qrBlob], `medicine_qr_${nextTokenId}.png`, { type: 'image/png' });
      console.log('Step 3: Uploading QR code to IPFS...');
      const qrResponse = await ipfsService.uploadFile(qrFile, `Medicine QR Code Token ${nextTokenId}`);
      console.log('QR uploaded:', qrResponse);
      
      // Step 3: Create metadata linking to the QR image (use HTTP URL for metadata)
      const metadata = {
        name: `${name} - Medicine #${medicineId}`,
        description: `Medical drug token for ${name} with QR code verification`,
        image: qrResponse.ipfsUrl, // HTTP URL for metadata
        attributes: [
          { trait_type: "Medicine ID", value: medicineId.toString() },
          { trait_type: "Drug Name", value: name },
          { trait_type: "Expiry (days)", value: (expiry / (24 * 60 * 60)).toString() },
          { trait_type: "Created", value: new Date().toISOString() },
          { trait_type: "Contract", value: contract_address }
        ],
        external_url: `https://sepolia.etherscan.io/address/${contract_address}`,
        qr_code: qrResponse.ipfsUrl, // HTTP URL for easy access
        qr_ipfs: qrResponse.ipfsUrl  // HTTP URL (changed from IPFS URI)
      };
      
      // Step 4: Upload metadata to IPFS
      console.log('Step 3-4: Creating and uploading metadata to IPFS...');
      const metadataResponse = await ipfsService.uploadJSON(metadata, `Medicine ${medicineId} Metadata`);
      console.log('Metadata uploaded:', metadataResponse);
      
      // Step 5: Mint NFT with HTTP metadata URL (using HTTP URI everywhere)
      console.log('Step 5: Minting drug with HTTP metadata URL...');
      const tx = await contract.mintDrug(medicineId, name, expiry, metadataResponse.ipfsUrl);
      await tx.wait();
      
      // Store QR data for display
      setMintedQrData({
        medicineId,
        tokenId: nextTokenId.toString(), // Use the pre-fetched token ID
        name,
        qrImageUrl: qrResponse.ipfsUrl,      // HTTP URL for display
        qrImageUri: qrResponse.ipfsUrl,      // HTTP URL (changed from IPFS URI)
        metadataUrl: metadataResponse.ipfsUrl, // HTTP URL for display  
        metadataUri: metadataResponse.ipfsUrl, // HTTP URL (changed from IPFS URI)
        qrData: JSON.stringify({
          tokenId: nextTokenId.toString(), // Use the correct token ID in QR code
          drugName: name,
          medicineId: medicineId.toString(),
          expiryDate: new Date(Date.now() + (expiry * 1000)).toISOString(),
          contractAddress: contract_address,
          network: "sepolia"
        })
      });
      
      alert(`Drug minted successfully!\nNFT Token ID: ${nextTokenId.toString()}\nMedicine ID: ${medicineId}\nQR Code: ${qrResponse.ipfsUrl}\nMetadata: ${metadataResponse.ipfsUrl}`);
      await loadDrugs();
      
      // Increment the token ID counter after successful minting
      incrementTokenId();
    } catch (error) {
      console.error("Failed to mint drug:", error);
      alert("Failed to mint drug: " + error.message);
    } finally {
      setMintLoading(false);
    }
  }

  const transferToIntermediary = async (tokenId, intermediaryAddress) => {
    if (!contract) return;
    try {
      setTransferLoading(true);
      const tx = await contract.transferToIntermediary(tokenId, intermediaryAddress);
      await tx.wait();
      alert(`Drug token ${tokenId} successfully transferred to intermediary: ${intermediaryAddress}`);
    } catch (error) {
      console.error("Failed to transfer drug:", error);
      alert("Failed to transfer drug: " + error.message);
    } finally {
      setTransferLoading(false);
    }
  }

  const verifyDrug = async (tokenId) => {
    if (!contract) return;
    try {
      setVerifyLoading(true);
      
      // Get drug information first
      const drugInfo = await contract.drugs(tokenId);
      const isExpired = await contract.isDrugExpired(tokenId);
      const owner = await contract.ownerOf(tokenId);
      const tokenURI = await contract.tokenURI(tokenId);
      
      // Call verify function on the blockchain
      const tx = await contract.verifyDrug(tokenId);
      await tx.wait();
      
      // Set verification result with drug information
      setVerificationResult({
        tokenId: tokenId,
        verified: true,
        drugInfo: {
          tokenId: drugInfo.tokenId.toString(),
          medicineId: drugInfo.medicineId.toString(),
          name: drugInfo.name,
          expiryTimestamp: drugInfo.expiryTimestamp.toString(),
          status: drugInfo.status,
          currentHolder: drugInfo.currentHolder,
          owner: owner,
          isExpired: isExpired,
          tokenURI: tokenURI
        },
        timestamp: new Date().toISOString()
      });
      
      alert(`Drug token ${tokenId} verified successfully!`);
    } catch (error) {
      console.error("Failed to verify drug:", error);
      setVerificationResult({
        tokenId: tokenId,
        verified: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      alert("Failed to verify drug: " + error.message);
    } finally {
      setVerifyLoading(false);
    }
  }

  const createPrescription = async (patientAddress, medicineId, validityDays) => {
    if (!contract) return;
    try {
      setLoading(true);
      const validityTime = validityDays * 24 * 60 * 60; // Convert days to seconds
      const tx = await contract.createPrescription(patientAddress, medicineId, validityTime);
      await tx.wait();
      alert('Prescription created successfully!');
    } catch (error) {
      console.error("Failed to create prescription:", error);
      alert("Failed to create prescription: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  const transferDrug = async (to, tokenId) => {
    if (!contract) return;
    try {
      setLoading(true);
      const tx = await contract.transferToPharmacy(tokenId, to);
      await tx.wait();
      alert(`Drug token ${tokenId} transferred successfully to: ${to}`);
      await loadTransfers();
    } catch (error) {
      console.error("Failed to transfer drug:", error);
      alert("Failed to transfer drug: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  const dispenseMedicine = async (patientAddress) => {
    if (!contract) return;
    try {
      setLoading(true);
      const tx = await contract.dispenseMedicine(patientAddress);
      await tx.wait();
      alert('Medicine dispensed successfully!');
    } catch (error) {
      console.error("Failed to dispense medicine:", error);
      alert("Failed to dispense medicine: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  const createInsuranceClaim = async (prescriptionId) => {
    if (!contract) return;
    try {
      setLoading(true);
      const tx = await contract.createInsuranceClaim(prescriptionId);
      await tx.wait();
      alert('Insurance claim submitted successfully!');
      await loadClaims();
    } catch (error) {
      console.error("Failed to create insurance claim:", error);
      alert("Failed to create insurance claim: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  const processInsuranceClaim = async (claimId, approved) => {
    if (!contract) return;
    try {
      setLoading(true);
      const tx = await contract.processInsuranceClaim(claimId, approved);
      await tx.wait();
      alert(`Insurance claim ${approved ? 'approved' : 'rejected'} successfully!`);
      await loadClaims();
    } catch (error) {
      console.error("Failed to process claim:", error);
      alert("Failed to process claim: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  const loadDrugs = async () => {
    // This would require additional functionality to track minted drugs
    // For now, we'll show placeholder data
    setDrugs([]);
  }

  const loadTransfers = async () => {
    // Load transfer history for intermediary
    setTransfers([]);
  }

  const loadPendingClaims = async () => {
    if (!contract || !userRoles.includes('Insurer')) return;
    try {
      const pendingClaimIds = await contract.getPendingClaims();
      const claimsWithDetails = await Promise.all(
        pendingClaimIds.map(async (claimId) => {
          try {
            const claim = await contract.insuranceClaims(claimId);
            return {
              claimId: claimId.toString(),
              prescriptionId: claim.prescriptionId.toString(),
              isApproved: claim.isApproved
            };
          } catch (error) {
            console.error(`Error loading claim ${claimId}:`, error);
            return null;
          }
        })
      );
      setClaims(claimsWithDetails.filter(claim => claim !== null));
    } catch (error) {
      console.error("Failed to load pending claims:", error);
    }
  }

  const loadClaims = async () => {
    await loadPendingClaims();
  }

  const loadMyPrescriptions = async () => {
    if (!contract || !userRoles.includes('Patient')) return;
    try {
      const prescriptionIds = await contract.getMyPrescriptions();
      setPrescriptions(prescriptionIds.map(id => ({ id: id.toString() })));
    } catch (error) {
      console.error("Failed to load prescriptions:", error);
    }
  }

  useEffect(() => {
    if (contract && userRoles.includes('Patient')) {
      loadMyPrescriptions();
    }
    if (contract && userRoles.includes('Insurer')) {
      loadPendingClaims();
    }
  }, [contract, userRoles]);

  const DrugMintForm = () => {
    const [formData, setFormData] = useState({
      medicineId: '',
      name: '',
      expiry: ''
    });

    const handleSubmit = (e) => {
      e.preventDefault();
      const expirySeconds = parseInt(formData.expiry) * 24 * 60 * 60; // Convert days to seconds
      mintDrug(parseInt(formData.medicineId), formData.name, expirySeconds, '');
      setFormData({ medicineId: '', name: '', expiry: '' });
    };

    return (
      <div className="manufacturer-layout">
        {/* Minting Section */}
        <div className="mint-section">
          <div className="form-container">
            <h3>🔨 Mint New Drug NFT</h3>
            <p>Create a new drug NFT with automatic QR code generation and IPFS metadata</p>
            
            {/* Next Token ID Display */}
            <div style={{ 
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
              borderRadius: '10px', 
              padding: '1rem', 
              margin: '1rem 0',
              color: 'white',
              textAlign: 'center'
            }}>
              <h4 style={{ margin: '0 0 0.5rem 0' }}>🔢 Next Token ID</h4>
              <p style={{ 
                margin: 0, 
                fontSize: '1.5rem', 
                fontWeight: 'bold',
                textShadow: '1px 1px 2px rgba(0,0,0,0.3)'
              }}>
                {nextTokenId ? nextTokenId.toString() : 'Loading...'}
              </p>
              <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem', opacity: 0.9 }}>
                This will be assigned to your next minted NFT
              </p>
            </div>

            <form onSubmit={handleSubmit}>
              <input
                type="number"
                placeholder="Medicine ID (unique number)"
                value={formData.medicineId}
                onChange={(e) => setFormData({...formData, medicineId: e.target.value})}
                required
              />
              <input
                type="text"
                placeholder="Drug Name (e.g., Aspirin, Paracetamol)"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                required
              />
              <input
                type="number"
                placeholder="Expiry (days from now)"
                value={formData.expiry}
                onChange={(e) => setFormData({...formData, expiry: e.target.value})}
                required
              />
              <button type="submit" disabled={mintLoading}>
                {mintLoading ? '⏳ Minting & Generating QR...' : '🔨 Mint Drug with QR Code'}
              </button>
            </form>
            <p style={{ fontSize: '0.9em', color: '#666', marginTop: '1rem' }}>
              ℹ️ Metadata and QR codes are automatically uploaded to IPFS (using HTTP URLs)
            </p>
          </div>

          {mintedQrData && (
            <div className="form-container" style={{ marginTop: '1rem' }}>
              <h3>✅ Drug Minted Successfully!</h3>
              <div className="qr-display" style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <h4>📋 Drug Information</h4>
                  <p><strong>Token ID:</strong> {mintedQrData.tokenId}</p>
                  <p><strong>Drug Name:</strong> {mintedQrData.name}</p>
                  <div style={{ marginTop: '1rem' }}>
                    <h5>🔗 IPFS Links (HTTP URLs)</h5>
                    <p><strong>QR Image:</strong> <a href={mintedQrData.qrImageUrl} target="_blank" rel="noopener noreferrer">View QR Image</a></p>
                    <p><strong>QR Image URI:</strong> <code style={{ fontSize: '0.8rem', background: '#f0f0f0', padding: '2px 4px', borderRadius: '3px' }}>{mintedQrData.qrImageUri}</code></p>
                    <p><strong>Metadata:</strong> <a href={mintedQrData.metadataUrl} target="_blank" rel="noopener noreferrer">View Metadata</a></p>
                    <p><strong>Metadata URI:</strong> <code style={{ fontSize: '0.8rem', background: '#f0f0f0', padding: '2px 4px', borderRadius: '3px' }}>{mintedQrData.metadataUri}</code></p>
                  </div>
                </div>
                <div style={{ background: 'white', padding: '1rem', borderRadius: '10px' }}>
                  <h4 style={{ margin: '0 0 1rem 0', color: '#333' }}>📱 QR Code</h4>
                  <QRCodeSVG value={mintedQrData.qrData} size={200} />
                  <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.8rem', color: '#666', textAlign: 'center' }}>
                    Scan to verify drug authenticity
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Transfer Section */}
        <div className="transfer-section">
          <div className="form-container">
            <h3>🚚 Transfer Drug to Intermediary</h3>
            <p>Transfer a minted drug token to an intermediary in the supply chain</p>
            <TransferForm onTransfer={transferToIntermediary} loading={transferLoading} />
            
            {/* Additional Transfer Information */}
            <div style={{ 
              marginTop: '1.5rem', 
              padding: '1rem', 
              background: '#f8f9fa', 
              borderRadius: '8px',
              border: '1px solid #e9ecef'
            }}>
              <h4 style={{ margin: '0 0 0.5rem 0', color: '#495057' }}>📋 Transfer Guidelines</h4>
              <ul style={{ margin: '0', paddingLeft: '1.5rem', fontSize: '0.9rem', color: '#6c757d' }}>
                <li>Only the current owner can transfer tokens</li>
                <li>Ensure the intermediary address is correct</li>
                <li>Transfer creates an immutable blockchain record</li>
                <li>Use the Token ID from newly minted drugs</li>
              </ul>
            </div>

            {/* Transfer History or Status could go here */}
            <div style={{ 
              marginTop: '1rem', 
              padding: '1rem', 
              background: 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)', 
              borderRadius: '8px'
            }}>
              <h4 style={{ margin: '0 0 0.5rem 0', color: '#1565c0' }}>🔄 Transfer Status</h4>
              <p style={{ margin: '0', fontSize: '0.9rem', color: '#1976d2' }}>
                {transferLoading ? '⏳ Transfer in progress...' : '✅ Ready for transfers'}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const TransferForm = ({ onTransfer, loading }) => {
    const [transferData, setTransferData] = useState({
      tokenId: '',
      intermediaryAddress: ''
    });

    const handleTransferSubmit = (e) => {
      e.preventDefault();
      onTransfer(parseInt(transferData.tokenId), transferData.intermediaryAddress);
      setTransferData({ tokenId: '', intermediaryAddress: '' });
    };

    return (
      <form onSubmit={handleTransferSubmit}>
        <input
          type="number"
          placeholder="Token ID to Transfer"
          value={transferData.tokenId}
          onChange={(e) => setTransferData({...transferData, tokenId: e.target.value})}
          required
        />
        <input
          type="text"
          placeholder="Intermediary Address (0x...)"
          value={transferData.intermediaryAddress}
          onChange={(e) => setTransferData({...transferData, intermediaryAddress: e.target.value})}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? '⏳ Transferring...' : '🚚 Transfer to Intermediary'}
        </button>
      </form>
    );
  };

  const PrescriptionForm = () => {
    const [formData, setFormData] = useState({
      patientAddress: '',
      medicineId: '',
      validityDays: ''
    });

    const handleSubmit = (e) => {
      e.preventDefault();
      createPrescription(formData.patientAddress, parseInt(formData.medicineId), parseInt(formData.validityDays));
      setFormData({ patientAddress: '', medicineId: '', validityDays: '' });
    };

    return (
      <div className="form-container">
        <h3>Create Prescription</h3>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Patient Address"
            value={formData.patientAddress}
            onChange={(e) => setFormData({...formData, patientAddress: e.target.value})}
            required
          />
          <input
            type="number"
            placeholder="Medicine ID"
            value={formData.medicineId}
            onChange={(e) => setFormData({...formData, medicineId: e.target.value})}
            required
          />
          <input
            type="number"
            placeholder="Validity (days)"
            value={formData.validityDays}
            onChange={(e) => setFormData({...formData, validityDays: e.target.value})}
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Creating...' : 'Create Prescription'}
          </button>
        </form>
      </div>
    );
  };

  const IntermediaryForm = () => {
    const [transferData, setTransferData] = useState({
      to: '',
      tokenId: ''
    });
    
    const [verifyData, setVerifyData] = useState({
      tokenId: ''
    });

    const handleTransferSubmit = (e) => {
      e.preventDefault();
      transferDrug(transferData.to, parseInt(transferData.tokenId));
      setTransferData({ to: '', tokenId: '' });
    };
    
    const handleVerifySubmit = (e) => {
      e.preventDefault();
      verifyDrug(parseInt(verifyData.tokenId));
      setVerifyData({ tokenId: '' });
    };

    return (
      <div className="intermediary-layout">
        {/* Verification Section */}
        <div className="verify-section">
          <div className="form-container">
            <h3>🔍 Verify Drug Token</h3>
            <p>Verify the authenticity and status of a drug token in your possession</p>
            
            <form onSubmit={handleVerifySubmit}>
              <input
                type="number"
                placeholder="Token ID to Verify"
                value={verifyData.tokenId}
                onChange={(e) => setVerifyData({tokenId: e.target.value})}
                required
              />
              <button type="submit" disabled={verifyLoading}>
                {verifyLoading ? '⏳ Verifying...' : '🔍 Verify Drug Token'}
              </button>
            </form>
            
            {/* Verification Guidelines */}
            <div style={{ 
              marginTop: '1.5rem', 
              padding: '1rem', 
              background: '#e3f2fd', 
              borderRadius: '8px',
              border: '1px solid #bbdefb'
            }}>
              <h4 style={{ margin: '0 0 0.5rem 0', color: '#1565c0' }}>📋 Verification Guidelines</h4>
              <ul style={{ margin: '0', paddingLeft: '1.5rem', fontSize: '0.9rem', color: '#1976d2' }}>
                <li>Enter the Token ID from QR code or drug package</li>
                <li>Verification checks authenticity and ownership</li>
                <li>Expired drugs will be clearly marked</li>
                <li>Only existing tokens can be verified</li>
              </ul>
            </div>
          </div>

          {/* Verification Result Display */}
          {verificationResult && (
            <div className={`verification-result ${verificationResult.verified ? 'verification-success' : 'verification-error'}`}>
              <h3>
                {verificationResult.verified ? '✅ Verification Successful' : '❌ Verification Failed'}
              </h3>
              
              {verificationResult.verified ? (
                <div>
                  <p><strong>Token ID {verificationResult.tokenId} is authentic!</strong></p>
                  
                  {verificationResult.drugInfo && (
                    <div className="drug-details">
                      <div className="drug-detail-item">
                        <strong>Drug Name:</strong>
                        <span>{verificationResult.drugInfo.name}</span>
                      </div>
                      <div className="drug-detail-item">
                        <strong>Medicine ID:</strong>
                        <span>{verificationResult.drugInfo.medicineId}</span>
                      </div>
                      <div className="drug-detail-item">
                        <strong>Current Owner:</strong>
                        <span style={{ fontSize: '0.8rem', wordBreak: 'break-all' }}>
                          {verificationResult.drugInfo.owner}
                        </span>
                      </div>
                      <div className="drug-detail-item">
                        <strong>Expiry Date:</strong>
                        <span>{new Date(parseInt(verificationResult.drugInfo.expiryTimestamp) * 1000).toLocaleDateString()}</span>
                        {verificationResult.drugInfo.isExpired && (
                          <div className="expired-warning">⚠️ EXPIRED</div>
                        )}
                      </div>
                      <div className="drug-detail-item">
                        <strong>Status:</strong>
                        <span>Status Code: {verificationResult.drugInfo.status}</span>
                      </div>
                    </div>
                  )}
                  
                  <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '1rem' }}>
                    Verified on: {new Date(verificationResult.timestamp).toLocaleString()}
                  </p>
                </div>
              ) : (
                <div>
                  <p><strong>Token ID {verificationResult.tokenId} verification failed</strong></p>
                  <p style={{ color: '#721c24' }}>Error: {verificationResult.error}</p>
                  <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '1rem' }}>
                    Attempted on: {new Date(verificationResult.timestamp).toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Transfer Section */}
        <div className="transfer-section-int">
          <div className="form-container">
            <h3>🚚 Transfer Drug to Next Stage</h3>
            <p>Transfer drugs in the supply chain to pharmacists or other intermediaries</p>
            
            <form onSubmit={handleTransferSubmit}>
              <input
                type="text"
                placeholder="Recipient Address (Pharmacist/Intermediary)"
                value={transferData.to}
                onChange={(e) => setTransferData({...transferData, to: e.target.value})}
                required
              />
              <input
                type="number"
                placeholder="Token ID to Transfer"
                value={transferData.tokenId}
                onChange={(e) => setTransferData({...transferData, tokenId: e.target.value})}
                required
              />
              <button type="submit" disabled={loading}>
                {loading ? '⏳ Transferring...' : '🚚 Transfer Drug'}
              </button>
            </form>
            
            {/* Transfer Guidelines */}
            <div style={{ 
              marginTop: '1.5rem', 
              padding: '1rem', 
              background: '#f8f9fa', 
              borderRadius: '8px',
              border: '1px solid #e9ecef'
            }}>
              <h4 style={{ margin: '0 0 0.5rem 0', color: '#495057' }}>📋 Transfer Guidelines</h4>
              <ul style={{ margin: '0', paddingLeft: '1.5rem', fontSize: '0.9rem', color: '#6c757d' }}>
                <li>Verify drug authenticity before transfer</li>
                <li>Ensure recipient address is correct</li>
                <li>Use Token ID (unique NFT identifier) for transfers</li>
                <li>Record all transfers for audit trail</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const PharmacistForm = () => {
    const [formData, setFormData] = useState({
      patientAddress: ''
    });

    const handleSubmit = (e) => {
      e.preventDefault();
      dispenseMedicine(formData.patientAddress);
      setFormData({ patientAddress: '' });
    };

    return (
      <div>
        <div className="form-container">
          <h3>💊 Dispense Medicine</h3>
          <p>Dispense medicine to patients - the system will automatically find their valid prescription and available medicine</p>
          <form onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder="Patient Address (0x...)"
              value={formData.patientAddress}
              onChange={(e) => setFormData({patientAddress: e.target.value})}
              required
            />
            <button type="submit" disabled={loading}>
              {loading ? '⏳ Dispensing...' : '💊 Dispense Medicine'}
            </button>
          </form>
          
          {/* Additional Information */}
          <div style={{ 
            marginTop: '1.5rem', 
            padding: '1rem', 
            background: '#e8f5e8', 
            borderRadius: '8px',
            border: '1px solid #c3e6c3'
          }}>
            <h4 style={{ margin: '0 0 0.5rem 0', color: '#2d5a2d' }}>📋 How it Works</h4>
            <ul style={{ margin: '0', paddingLeft: '1.5rem', fontSize: '0.9rem', color: '#4a6741' }}>
              <li>System automatically finds patient's latest valid prescription</li>
              <li>Locates matching medicine in your pharmacy inventory</li>
              <li>Verifies medicine is not expired before dispensing</li>
              <li>Burns the NFT token after successful dispensing</li>
            </ul>
          </div>
        </div>

        <div className="form-container" style={{ marginTop: '2rem' }}>
          <h3>📊 Pharmacy Inventory</h3>
          <p>Available medicines in your pharmacy inventory</p>
          <div style={{ 
            background: 'linear-gradient(135deg, #ffeaa7 0%, #fab1a0 100%)',
            borderRadius: '10px',
            padding: '1rem',
            margin: '1rem 0'
          }}>
            <p><strong>📦 Inventory Status:</strong> Connect to view available medicines</p>
            <p><strong>🔍 QR Scanner:</strong> Scan QR codes to verify medicine authenticity</p>
          </div>
        </div>
      </div>
    );
  };

  const InsurerForm = () => {
    const [processFormData, setProcessFormData] = useState({
      claimId: '',
      approved: true
    });

    const handleProcessSubmit = (e) => {
      e.preventDefault();
      processInsuranceClaim(parseInt(processFormData.claimId), processFormData.approved);
      setProcessFormData({ claimId: '', approved: true });
    };

    const handleQuickProcess = (claimId, approved) => {
      processInsuranceClaim(parseInt(claimId), approved);
    };

    return (
      <div>
        <div className="form-container">
          <h3>📋 Pending Insurance Claims</h3>
          <p>Review and process insurance claims submitted by patients</p>
          
          {claims.length > 0 ? (
            <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '1.5rem' }}>
              {claims.map((claim, index) => (
                <div key={claim.claimId} style={{ 
                  padding: '1rem',
                  margin: '0.5rem 0',
                  background: '#f8f9fa',
                  borderRadius: '8px',
                  border: '1px solid #e9ecef'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>Claim ID: {claim.claimId}</strong>
                      <p style={{ margin: '0.5rem 0', fontSize: '0.9rem', color: '#666' }}>
                        Prescription ID: {claim.prescriptionId}
                      </p>
                      <p style={{ margin: '0', fontSize: '0.8rem', color: '#888' }}>
                        Status: {claim.isApproved ? 'Approved' : 'Pending Review'}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button 
                        onClick={() => handleQuickProcess(claim.claimId, true)}
                        style={{
                          padding: '0.5rem 1rem',
                          background: '#28a745',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.8rem'
                        }}
                        disabled={loading || claim.isApproved}
                      >
                        ✅ Approve
                      </button>
                      <button 
                        onClick={() => handleQuickProcess(claim.claimId, false)}
                        style={{
                          padding: '0.5rem 1rem',
                          background: '#dc3545',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.8rem'
                        }}
                        disabled={loading || claim.isApproved}
                      >
                        ❌ Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ 
              textAlign: 'center', 
              padding: '2rem',
              color: '#6c757d',
              background: '#f8f9fa',
              borderRadius: '8px',
              border: '1px solid #e9ecef',
              marginBottom: '1.5rem'
            }}>
              <p>📝 No pending claims found</p>
              <p style={{ fontSize: '0.9rem' }}>New insurance claims will appear here</p>
            </div>
          )}
          
          <button 
            onClick={loadPendingClaims}
            style={{
              padding: '0.5rem 1rem',
              background: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
            disabled={loading}
          >
            {loading ? '⏳ Loading...' : '🔄 Refresh Claims'}
          </button>
        </div>

        <div className="form-container">
          <h3>⚖️ Process Specific Claim</h3>
          <p>Manually process a claim by entering its ID</p>
          
          <form onSubmit={handleProcessSubmit}>
            <input
              type="number"
              placeholder="Claim ID to Process"
              value={processFormData.claimId}
              onChange={(e) => setProcessFormData({...processFormData, claimId: e.target.value})}
              required
            />
            <select
              value={processFormData.approved}
              onChange={(e) => setProcessFormData({...processFormData, approved: e.target.value === 'true'})}
            >
              <option value={true}>✅ Approve Claim</option>
              <option value={false}>❌ Reject Claim</option>
            </select>
            <button type="submit" disabled={loading}>
              {loading ? '⏳ Processing...' : '⚖️ Process Claim'}
            </button>
          </form>
          
          {/* Guidelines */}
          <div style={{ 
            marginTop: '1.5rem', 
            padding: '1rem', 
            background: '#e8f5e8', 
            borderRadius: '8px',
            border: '1px solid #c3e6c3'
          }}>
            <h4 style={{ margin: '0 0 0.5rem 0', color: '#2d5a2d' }}>📋 Processing Guidelines</h4>
            <ul style={{ margin: '0', paddingLeft: '1.5rem', fontSize: '0.9rem', color: '#4a6741' }}>
              <li>Review each claim carefully before approval/rejection</li>
              <li>Verify that the prescription was properly dispensed</li>
              <li>Once processed, claims cannot be modified</li>
              <li>Use the refresh button to see newly submitted claims</li>
            </ul>
          </div>
        </div>

        <div className="form-container">
          <h3>📊 Claims Statistics</h3>
          <div style={{ 
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
            borderRadius: '10px', 
            padding: '1rem', 
            margin: '1rem 0',
            color: 'white'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem', textAlign: 'center' }}>
              <div>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '2rem' }}>{claims.length}</h4>
                <p style={{ margin: '0', fontSize: '0.9rem', opacity: 0.9 }}>Pending Claims</p>
              </div>
              <div>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '2rem' }}>{claims.filter(c => c.isApproved).length}</h4>
                <p style={{ margin: '0', fontSize: '0.9rem', opacity: 0.9 }}>Approved</p>
              </div>
              <div>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '2rem' }}>{claims.filter(c => !c.isApproved).length}</h4>
                <p style={{ margin: '0', fontSize: '0.9rem', opacity: 0.9 }}>Awaiting Review</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const PatientForm = () => {
    const [claimData, setClaimData] = useState({
      prescriptionId: ''
    });

    const handleClaimSubmit = (e) => {
      e.preventDefault();
      createInsuranceClaim(parseInt(claimData.prescriptionId));
      setClaimData({ prescriptionId: '' });
    };

    return (
      <div>
        {/* Patient Registration - Always show first */}
        {!userRoles.includes('Patient') && (
          <div className="form-container">
            <h3>👤 Patient Registration</h3>
            <p>Register as a patient to access prescriptions and insurance features</p>
            <button onClick={registerAsPatient} disabled={loading}>
              {loading ? 'Registering...' : 'Register as Patient'}
            </button>
            
            <div style={{ 
              marginTop: '1.5rem', 
              padding: '1rem', 
              background: '#fff3cd', 
              borderRadius: '8px',
              border: '1px solid #ffeaa7'
            }}>
              <h4 style={{ margin: '0 0 0.5rem 0', color: '#856404' }}>ℹ️ Patient Features</h4>
              <p style={{ margin: '0', fontSize: '0.9rem', color: '#856404' }}>
                Once registered, you'll be able to view your prescriptions and submit insurance claims.
              </p>
            </div>
          </div>
        )}

        {/* Only show patient functions if registered */}
        {userRoles.includes('Patient') && (
          <>
            <div className="form-container">
              <h3>📋 My Prescriptions</h3>
              <p>View your prescriptions and their status</p>
              {prescriptions.length > 0 ? (
                <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '1rem' }}>
                  {prescriptions.map(p => (
                    <div key={p.id} className="prescription-item" style={{ 
                      padding: '1rem',
                      margin: '0.5rem 0',
                      background: '#f8f9fa',
                      borderRadius: '8px',
                      border: '1px solid #e9ecef'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong>Prescription ID: {p.id}</strong>
                          <p style={{ margin: '0.5rem 0', fontSize: '0.9rem', color: '#666' }}>
                            Status: Available for insurance claim
                          </p>
                        </div>
                        <button 
                          onClick={() => setClaimData({ prescriptionId: p.id })}
                          style={{
                            padding: '0.5rem 1rem',
                            background: '#007bff',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.8rem'
                          }}
                        >
                          Select for Claim
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '2rem',
                  color: '#6c757d',
                  background: '#f8f9fa',
                  borderRadius: '8px',
                  border: '1px solid #e9ecef',
                  marginBottom: '1rem'
                }}>
                  <p>📝 No prescriptions found</p>
                  <p style={{ fontSize: '0.9rem' }}>Your prescriptions will appear here</p>
                </div>
              )}
            </div>

            <div className="form-container">
              <h3>🏥 Apply for Insurance Claim</h3>
              <p>Submit an insurance claim for dispensed medicine based on your prescription</p>
              
              <form onSubmit={handleClaimSubmit}>
                <input
                  type="number"
                  placeholder="Prescription ID"
                  value={claimData.prescriptionId}
                  onChange={(e) => setClaimData({prescriptionId: e.target.value})}
                  required
                />
                <button type="submit" disabled={loading}>
                  {loading ? '⏳ Submitting Claim...' : '🏥 Submit Insurance Claim'}
                </button>
              </form>
              
              {/* Additional Information */}
              <div style={{ 
                marginTop: '1.5rem', 
                padding: '1rem', 
                background: '#e3f2fd', 
                borderRadius: '8px',
                border: '1px solid #bbdefb'
              }}>
                <h4 style={{ margin: '0 0 0.5rem 0', color: '#1565c0' }}>📋 Insurance Claim Guidelines</h4>
                <ul style={{ margin: '0', paddingLeft: '1.5rem', fontSize: '0.9rem', color: '#1976d2' }}>
                  <li>Only dispensed prescriptions are eligible for insurance claims</li>
                  <li>Claims can only be submitted by the prescription holder</li>
                  <li>Each prescription can only have one insurance claim</li>
                  <li>Claims will be reviewed by insurance providers</li>
                </ul>
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderTabContent = () => {
    switch(activeTab) {
      case 'admin':
        return <RoleGranter contract={contract} loading={loading} setLoading={setLoading} userRoles={userRoles} account={account} />;
      case 'manufacturer':
        return userRoles.includes('Manufacturer') ? <DrugMintForm /> : <div>You don't have manufacturer access</div>;
      case 'intermediary':
        return userRoles.includes('Intermediary') ? <IntermediaryForm /> : <div>You don't have intermediary access</div>;
      case 'pharmacist':
        return userRoles.includes('Pharmacist') ? <PharmacistForm /> : <div>You don't have pharmacist access</div>;
      case 'doctor':
        return userRoles.includes('Doctor') ? <PrescriptionForm /> : <div>You don't have doctor access</div>;
      case 'insurer':
        return userRoles.includes('Insurer') ? <InsurerForm /> : <div>You don't have insurer access</div>;
      case 'patient':
        return <PatientForm />;
      default:
        return (
          <div>
            <h3>System Overview</h3>
            <div className="stats-grid">
              <div className="stat-card">
                <h4>Contract Address</h4>
                <p className="address">{contract_address}</p>
              </div>
              <div className="stat-card">
                <h4>Network</h4>
                <p>Sepolia Testnet</p>
              </div>
              <div className="stat-card">
                <h4>Your Roles</h4>
                <p>{userRoles.length > 0 ? userRoles.join(', ') : 'None'}</p>
                {userRoles.length === 0 && (
                  <div style={{ marginTop: '0.5rem', padding: '0.5rem', backgroundColor: '#fff3cd', border: '1px solid #ffeaa7', borderRadius: '4px', fontSize: '0.85rem' }}>
                    <strong>ℹ️ No roles detected</strong><br/>
                    Admin role is only granted to the contract deployer.<br/>
                    Contact the deployer or use the RoleGranter if you have admin access.
                  </div>
                )}
              </div>
              <div className="stat-card">
                <h4>Connected Account</h4>
                <p className="address">{account ? `${account.substring(0, 6)}...${account.substring(38)}` : 'Not connected'}</p>
              </div>
            </div>
            
            <div style={{ marginTop: '2rem', textAlign: 'center' }}>
              <h4>🚀 Welcome to the Medical Supply Chain</h4>
              <p>This DApp enables secure, role-based management of pharmaceutical supply chains using blockchain technology.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
                <div className="feature-card">
                  <h5>🏭 Manufacturers</h5>
                  <p>Mint drug NFTs with expiry tracking and QR codes</p>
                </div>
                <div className="feature-card">
                  <h5>🚚 Intermediaries</h5>
                  <p>Transfer drugs through the supply chain</p>
                </div>
                <div className="feature-card">
                  <h5>💊 Pharmacists</h5>
                  <p>Dispense medicines based on valid prescriptions</p>
                </div>
                <div className="feature-card">
                  <h5>⚕️ Doctors</h5>
                  <p>Create secure prescriptions for patients</p>
                </div>
                <div className="feature-card">
                  <h5>🏥 Insurers</h5>
                  <p>Process insurance claims for medical expenses</p>
                </div>
                <div className="feature-card">
                  <h5>🧑‍🦱 Patients</h5>
                  <p>View prescriptions and track medicine history</p>
                </div>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <img 
            src={Logo} 
            alt="Programming Club IIT Kanpur" 
            className="header-logo"
          />
          <h1>🏥 Medical Supply Chain DApp</h1>
        </div>
        <button 
          onClick={connectWallet} 
          className={`connect-btn ${account ? 'connected' : ''}`}
          disabled={loading}
        >
          {loading ? 'Connecting...' : account ? `Connected: ${account.substring(0, 6)}...${account.substring(38)}` : 'Connect Wallet'}
        </button>
      </header>

      {account && (
        <div className="main-content">
          <nav className="tab-nav">
            <button 
              className={activeTab === 'overview' ? 'active' : ''} 
              onClick={() => setActiveTab('overview')}
            >
              📊 Overview
            </button>
            
            {/* Admin sees all tabs */}
            {userRoles.includes('Admin') && (
              <>
                <button 
                  className={activeTab === 'manufacturer' ? 'active' : ''} 
                  onClick={() => setActiveTab('manufacturer')}
                >
                  🏭 Manufacturer
                </button>
                <button 
                  className={activeTab === 'intermediary' ? 'active' : ''} 
                  onClick={() => setActiveTab('intermediary')}
                >
                  🚚 Intermediary
                </button>
                <button 
                  className={activeTab === 'pharmacist' ? 'active' : ''} 
                  onClick={() => setActiveTab('pharmacist')}
                >
                  💊 Pharmacist
                </button>
                <button 
                  className={activeTab === 'doctor' ? 'active' : ''} 
                  onClick={() => setActiveTab('doctor')}
                >
                  👨‍⚕️ Doctor
                </button>
                <button 
                  className={activeTab === 'insurer' ? 'active' : ''} 
                  onClick={() => setActiveTab('insurer')}
                >
                  🏥 Insurer
                </button>
                <button 
                  className={activeTab === 'patient' ? 'active' : ''} 
                  onClick={() => setActiveTab('patient')}
                >
                  🧑‍🦱 Patient
                </button>
                <button 
                  className={activeTab === 'admin' ? 'active' : ''} 
                  onClick={() => setActiveTab('admin')}
                >
                  ⚙️ Admin
                </button>
              </>
            )}

            {/* Non-admin users see their specific role + patient */}
            {!userRoles.includes('Admin') && (
              <>
                {userRoles.includes('Manufacturer') && (
                  <button 
                    className={activeTab === 'manufacturer' ? 'active' : ''} 
                    onClick={() => setActiveTab('manufacturer')}
                  >
                    🏭 Manufacturer
                  </button>
                )}
                {userRoles.includes('Intermediary') && (
                  <button 
                    className={activeTab === 'intermediary' ? 'active' : ''} 
                    onClick={() => setActiveTab('intermediary')}
                  >
                    🚚 Intermediary
                  </button>
                )}
                {userRoles.includes('Pharmacist') && (
                  <button 
                    className={activeTab === 'pharmacist' ? 'active' : ''} 
                    onClick={() => setActiveTab('pharmacist')}
                  >
                    💊 Pharmacist
                  </button>
                )}
                {userRoles.includes('Doctor') && (
                  <button 
                    className={activeTab === 'doctor' ? 'active' : ''} 
                    onClick={() => setActiveTab('doctor')}
                  >
                    👨‍⚕️ Doctor
                  </button>
                )}
                {userRoles.includes('Insurer') && (
                  <button 
                    className={activeTab === 'insurer' ? 'active' : ''} 
                    onClick={() => setActiveTab('insurer')}
                  >
                    🏥 Insurer
                  </button>
                )}
                
                {/* Everyone (including unregistered) sees Patient tab */}
                <button 
                  className={activeTab === 'patient' ? 'active' : ''} 
                  onClick={() => setActiveTab('patient')}
                >
                  🧑‍🦱 Patient
                </button>
              </>
            )}
          </nav>

          <div className="tab-content">
            {renderTabContent()}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
