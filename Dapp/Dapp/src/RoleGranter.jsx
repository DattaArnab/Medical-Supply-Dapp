import React, { useState } from 'react';

const RoleGranter = ({ contract, loading, setLoading, userRoles, account }) => {
  const [grantData, setGrantData] = useState({
    address: '',
    role: 'manufacturer'
  });

  const handleGrantRole = async (e) => {
    e.preventDefault();
    if (!contract) return;

    try {
      setLoading(true);
      let tx;
      
      switch(grantData.role) {
        case 'admin':
          // Grant admin role using direct grantRole function
          const adminRole = await contract.DEFAULT_ADMIN_ROLE();
          tx = await contract.grantRole(adminRole, grantData.address);
          break;
        case 'manufacturer':
          tx = await contract.grantMfg(grantData.address);
          break;
        case 'intermediary':
          tx = await contract.grantInt(grantData.address);
          break;
        case 'pharmacist':
          tx = await contract.grantPhar(grantData.address);
          break;
        case 'doctor':
          tx = await contract.grantDoc(grantData.address);
          break;
        case 'patient':
          tx = await contract.grantPat(grantData.address);
          break;
        case 'insurer':
          tx = await contract.grantIns(grantData.address);
          break;
        default:
          throw new Error('Invalid role selected');
      }
      
      await tx.wait();
      alert(`Successfully granted ${grantData.role} role to ${grantData.address}`);
      setGrantData({ address: '', role: 'manufacturer' });
    } catch (error) {
      console.error("Failed to grant role:", error);
      alert("Failed to grant role: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!userRoles.includes('Admin')) {
    return (
      <div className="form-container">
        <h3>Admin Access Required</h3>
        <div style={{ 
          padding: '1rem', 
          backgroundColor: '#fff3cd', 
          border: '1px solid #ffeaa7', 
          borderRadius: '8px',
          marginBottom: '1rem'
        }}>
          <h4>🔒 Admin Role Required</h4>
          <p>Only accounts with admin role can grant roles to other users.</p>
          <p><strong>Current Admin:</strong> The account that deployed the contract</p>
          <p><strong>Contract Address:</strong> {contract?.address || 'Loading...'}</p>
          
          <h5>To get admin access:</h5>
          <ol>
            <li>Ask the contract deployer to grant you admin role</li>
            <li>Or connect with the deployer wallet address</li>
          </ol>
        </div>
        
        <div style={{
          padding: '1rem',
          backgroundColor: '#d1ecf1',
          border: '1px solid #bee5eb',
          borderRadius: '8px'
        }}>
          <h5>💡 Need a role?</h5>
          <p>Share your wallet address with an admin:</p>
          <code style={{ 
            display: 'block', 
            padding: '0.5rem', 
            backgroundColor: '#f8f9fa', 
            border: '1px solid #dee2e6',
            borderRadius: '4px',
            marginTop: '0.5rem',
            wordBreak: 'break-all'
          }}>
            {account || 'Connect wallet first'}
          </code>
        </div>
      </div>
    );
  }

  return (
    <div className="form-container">
      <h3>Grant Roles (Admin Only)</h3>
      <form onSubmit={handleGrantRole}>
        <input
          type="text"
          placeholder="Address to grant role"
          value={grantData.address}
          onChange={(e) => setGrantData({...grantData, address: e.target.value})}
          required
        />
        <select
          value={grantData.role}
          onChange={(e) => setGrantData({...grantData, role: e.target.value})}
        >
          <option value="admin">Admin (Full Access)</option>
          <option value="manufacturer">Manufacturer</option>
          <option value="intermediary">Intermediary</option>
          <option value="pharmacist">Pharmacist</option>
          <option value="doctor">Doctor</option>
          <option value="patient">Patient</option>
          <option value="insurer">Insurer</option>
        </select>
        <button type="submit" disabled={loading}>
          {loading ? 'Granting...' : 'Grant Role'}
        </button>
      </form>
    </div>
  );
};

export default RoleGranter;
