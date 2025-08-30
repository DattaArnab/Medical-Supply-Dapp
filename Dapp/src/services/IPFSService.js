// IPFS Service using Pinata with JWT authentication
class IPFSService {
  constructor() {
    // Get credentials from environment variables
    this.pinataJWT = import.meta.env.VITE_PINATA_JWT;
    this.pinataGateway = import.meta.env.VITE_PINATA_GATEWAY || 'https://gateway.pinata.cloud';
    this.pinataBaseUrl = 'https://api.pinata.cloud';
    
    // Fallback to API Key + Secret
    this.pinataApiKey = import.meta.env.REACT_APP_PINATA_API_KEY;
    this.pinataSecretKey = import.meta.env.REACT_APP_PINATA_SECRET_KEY;
  }

  // Upload file (image) to IPFS via Pinata
  async uploadFile(file, filename) {
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const metadata = JSON.stringify({
        name: filename,
        keyvalues: {
          type: 'qr-code-image',
          timestamp: Date.now().toString()
        }
      });
      formData.append('pinataMetadata', metadata);

      const options = JSON.stringify({
        cidVersion: 1,
      });
      formData.append('pinataOptions', options);

      // Use JWT authentication
      const headers = this.pinataJWT ? 
        { 'Authorization': `Bearer ${this.pinataJWT}` } :
        {
          'pinata_api_key': this.pinataApiKey,
          'pinata_secret_api_key': this.pinataSecretKey,
        };

      const response = await fetch(`${this.pinataBaseUrl}/pinning/pinFileToIPFS`, {
        method: 'POST',
        headers: headers,
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      const result = await response.json();
      const ipfsUri = `ipfs://${result.IpfsHash}`;
      const httpUrl = this.getHttpUrl(ipfsUri);
      
      return {
        ipfsUri: ipfsUri,
        ipfsUrl: httpUrl,
        hash: result.IpfsHash
      };
    } catch (error) {
      console.error('Error uploading file to IPFS:', error);
      throw error;
    }
  }

  // Upload JSON metadata to IPFS via Pinata
  async uploadJSON(jsonData, filename) {
    try {
      const headers = this.pinataJWT ? 
        {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.pinataJWT}`
        } :
        {
          'Content-Type': 'application/json',
          'pinata_api_key': this.pinataApiKey,
          'pinata_secret_api_key': this.pinataSecretKey,
        };

      const response = await fetch(`${this.pinataBaseUrl}/pinning/pinJSONToIPFS`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          pinataContent: jsonData,
          pinataMetadata: {
            name: filename,
            keyvalues: {
              type: 'nft-metadata',
              timestamp: Date.now().toString()
            }
          }
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      const result = await response.json();
      const ipfsUri = `ipfs://${result.IpfsHash}`;
      const httpUrl = this.getHttpUrl(ipfsUri);
      
      return {
        ipfsUri: ipfsUri,
        ipfsUrl: httpUrl,
        hash: result.IpfsHash
      };
    } catch (error) {
      console.error('Error uploading JSON to IPFS:', error);
      throw error;
    }
  }

  // Get IPFS URL for display using your custom Pinata gateway
  getHttpUrl(ipfsUri) {
    if (ipfsUri.startsWith('ipfs://')) {
      const hash = ipfsUri.replace('ipfs://', '');
      return `${this.pinataGateway}/ipfs/${hash}`;
    }
    return ipfsUri;
  }

  // Test connection to Pinata
  async testConnection() {
    try {
      const headers = this.pinataJWT ? 
        { 'Authorization': `Bearer ${this.pinataJWT}` } :
        {
          'pinata_api_key': this.pinataApiKey,
          'pinata_secret_api_key': this.pinataSecretKey,
        };

      const response = await fetch(`${this.pinataBaseUrl}/data/testAuthentication`, {
        method: 'GET',
        headers: headers
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Pinata connection successful:', result);
        return true;
      } else {
        console.error('Pinata connection failed:', response.status);
        return false;
      }
    } catch (error) {
      console.error('Error testing Pinata connection:', error);
      return false;
    }
  }
}

export default IPFSService;
