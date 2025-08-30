// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.27;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Burnable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

contract MedicalDrugNFT is ERC721, ERC721Enumerable, ERC721URIStorage, ERC721Burnable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    uint256 private _nextTokenId=1;

    // Getter function to retrieve the next token ID that will be minted
    function getNextTokenId() public view returns (uint256) {
        return _nextTokenId;
    }

    function safeMint(address to, string memory uri)
        public
        onlyRole(MINTER_ROLE)
        returns (uint256)
    {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        return tokenId;
    }

    // The following functions are overrides required by Solidity.

    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Enumerable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable, ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    enum DrugStatus { Manufactured, InTransit, Verified, AtPharmacy, Dispensed }

    struct Drug {
        uint256 tokenId;
        uint256 medicineId;
        string name;
        uint256 expiryTimestamp;
        DrugStatus status;
        address currentHolder;
    }

    mapping(uint256 => Drug) public drugs;
    mapping(uint256 => uint256) public tokenToMedicineId;
    mapping(uint256 => uint256[]) public medicineIdToToken;

    event DrugMinted(uint256 indexed tokenId, uint256 indexed medicineId, string tokenURI);
    event DrugStatusUpdated(uint256 indexed tokenId, DrugStatus newStatus);

    bytes32 public constant MFG_ROLE = keccak256("MFG_ROLE");
    bytes32 public constant INT_ROLE = keccak256("INT_ROLE");
    bytes32 public constant PHAR_ROLE = keccak256("PHAR_ROLE");

    constructor() ERC721("MedicalSupplyChain", "MSC") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function grantMfg(address manufacturer) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(MFG_ROLE, manufacturer);
    }
    function grantInt(address intermediary) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(INT_ROLE, intermediary);
    }
    function grantPhar(address pharmacist) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(PHAR_ROLE, pharmacist);
    }

    function mintDrug(
        uint256 medicineId,
        string memory name,
        uint256 expiry,
        string memory uri
    ) public onlyRole(MFG_ROLE) returns (uint256) {
        require(medicineId != 0, "Medicine ID cannot be zero");
        uint256 tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, uri);

        drugs[tokenId] = Drug({
            tokenId: tokenId,
            medicineId: medicineId,
            name: name,
            expiryTimestamp: block.timestamp+expiry,
            status: DrugStatus.Manufactured,
            currentHolder: msg.sender
        });
        tokenToMedicineId[tokenId] = medicineId;
        medicineIdToToken[medicineId].push(tokenId);
        emit DrugMinted(tokenId, medicineId, uri);
        return tokenId;
    }

    function transferToIntermediary(uint256 tokenId, address intermediary) public onlyRole(MFG_ROLE) {
        require(hasRole(INT_ROLE, intermediary), "Address is not an intermediary");
        require(ownerOf(tokenId) == msg.sender, "Not the owner");
        require(drugs[tokenId].status == DrugStatus.Manufactured, "Drug not in manufactured state");
        require(!isDrugExpired(tokenId), "Drug has expired");
        _transfer(msg.sender, intermediary, tokenId);
        drugs[tokenId].status = DrugStatus.InTransit;
        drugs[tokenId].currentHolder = intermediary;
        emit DrugStatusUpdated(tokenId, DrugStatus.InTransit);
    }

    function verifyDrug(uint256 tokenId) public onlyRole(INT_ROLE) {
        require(ownerOf(tokenId) == msg.sender, "Not the owner");
        require(drugs[tokenId].status == DrugStatus.InTransit, "Drug not in transit");
        require(!isDrugExpired(tokenId), "Drug has expired");
        drugs[tokenId].status = DrugStatus.Verified;
        emit DrugStatusUpdated(tokenId, DrugStatus.Verified);
    }

    function transferToPharmacy(uint256 tokenId, address pharmacist) public onlyRole(INT_ROLE) {
        require(hasRole(PHAR_ROLE, pharmacist), "Address is not a pharmacist");
        require(ownerOf(tokenId) == msg.sender, "Not the owner");
        require(drugs[tokenId].status == DrugStatus.Verified, "Drug not verified");
        require(!isDrugExpired(tokenId), "Drug has expired");
        _transfer(msg.sender, pharmacist, tokenId);
        drugs[tokenId].status = DrugStatus.AtPharmacy;
        drugs[tokenId].currentHolder = pharmacist;
        emit DrugStatusUpdated(tokenId, DrugStatus.AtPharmacy);
    }

    function isDrugExpired(uint256 tokenId) public view returns (bool) {
        return block.timestamp > drugs[tokenId].expiryTimestamp;
    }

}
