# 🔄 Automated NFT Minting with QR Codes and IPFS

This enhanced medical supply chain DApp now features **automated NFT minting** with QR code generation and IPFS metadata storage.

## 🆕 New Features

### Automated NFT Pipeline
When manufacturers mint new drugs, the system automatically:

1. **🔢 Gets Next Token ID**: Calls `getNextTokenId()` to retrieve the next sequential token ID
2. **📱 Creates QR Code**: Generates a unique QR code containing token verification data
3. **☁️ Uploads to IPFS**: Stores QR code image on IPFS via Pinata
4. **📝 Creates Metadata**: Generates JSON metadata with drug details and QR code link
5. **🔗 Mints NFT**: Calls smart contract with metadata URI and assigns the predicted token ID

### Enhanced UI
- **Real-time Token Counter**: Displays the next token ID that will be assigned prominently in the minting section
- **Visual Feedback**: Clear indication that QR codes and metadata are auto-generated
- **Streamlined Form**: Removed manual URI input - everything is automated!
- **Token ID Display**: Shows the upcoming NFT token ID in an attractive gradient box

## 🛠️ Setup Instructions

### 1. Install Dependencies
The following packages are already installed:
- `qrcode` - QR code generation
- `canvas` - Canvas rendering for QR codes
- `@pinata/sdk` - IPFS uploads via Pinata

### 2. Configure Pinata (IPFS Storage)
1. Create account at [pinata.cloud](https://app.pinata.cloud)
2. Generate API JWT token from the Keys section
3. Create `.env` file in the Dapp folder:
   ```
   VITE_PINATA_JWT=your_jwt_token_here
   VITE_PINATA_GATEWAY=https://gateway.pinata.cloud
   ```

### 3. Smart Contract
The system works with the deployed contract at:
**Address**: `0x2915181a447555D05B353F06236638aA8BDb89B8` (Sepolia)

## 🎯 How It Works

### For Manufacturers
1. Navigate to the **Drug Management** tab
2. Fill in the basic drug information:
   - Medicine ID
   - Drug Name  
   - Expiry (days from now)
3. Click **"Mint Drug with Auto QR"**
4. The system automatically:
   - Generates a unique QR code
   - Uploads it to IPFS
   - Creates metadata JSON
   - Mints the NFT with the metadata URI

### QR Code Content
Each QR code contains JSON data for verification:
```json
{
  "tokenId": 1,
  "drugName": "Aspirin",
  "medicineId": "MED001",
  "expiryDate": "2024-12-31T23:59:59.000Z",
  "contractAddress": "0x2915181a447555D05B353F06236638aA8BDb89B8",
  "network": "sepolia"
}
```

### Metadata Structure
```json
{
  "name": "Medical Drug NFT #1",
  "description": "NFT representing Aspirin in the medical supply chain",
  "image": "https://gateway.pinata.cloud/ipfs/Qm...",
  "attributes": [
    {"trait_type": "Drug Name", "value": "Aspirin"},
    {"trait_type": "Medicine ID", "value": "MED001"},
    {"trait_type": "Expiry Date", "value": "2024-12-31T23:59:59.000Z"},
    {"trait_type": "Token ID", "value": 1}
  ]
}
```

## 🔍 Verification Process

Pharmacies and patients can:
1. Scan the QR code on drug packaging
2. Verify token existence on blockchain
3. Check drug authenticity and expiry status
4. View complete supply chain history

## 🚀 Technical Implementation

### Files Modified/Created:
- `services/IPFSService.js` - Core IPFS and QR generation logic
- `hooks/useTokenCounter.js` - Token ID management
- `App.jsx` - Updated minting pipeline
- `App.css` - Enhanced UI styling

### Key Functions:
- `IPFSService.prepareNFTData()` - Complete automation pipeline
- `useTokenCounter()` - Tracks next available token ID
- `mintDrug()` - Updated to use automated process

## 🎉 Benefits

1. **🔒 Enhanced Security**: Each drug gets a unique, scannable QR code
2. **⚡ Streamlined Process**: No manual URI entry required
3. **☁️ Decentralized Storage**: QR codes and metadata stored on IPFS
4. **📱 Mobile Ready**: QR codes work with any smartphone
5. **🔍 Easy Verification**: Quick authenticity checks for everyone

The system is now ready for production use with complete NFT automation! 🚀
