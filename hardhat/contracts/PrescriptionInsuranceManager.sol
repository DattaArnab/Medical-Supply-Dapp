// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;
import "./MedicalDrugNFT.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
contract PrescriptionAndInsuranceManager is MedicalDrugNFT {
    uint256 internal _nextPrescriptionId = 1;
    uint256 internal _nextClaimId = 1;

    bytes32 public constant PAT_ROLE = keccak256("PAT_ROLE");
    bytes32 public constant INS_ROLE = keccak256("INS_ROLE");
    bytes32 public constant DOC_ROLE = keccak256("DOC_ROLE");

    struct Prescription {
        uint256 prescriptionId;
        address patient;
        address doctor;
        uint256 medicineId;
        uint256 validUntil;
        bool isDispensed;
        bytes32 prescriptionHash;
    }

    struct InsuranceClaim {
        uint256 claimId;
        uint256 prescriptionId;
        bool isApproved;
    }

    mapping(uint256 => Prescription) private prescriptions;
    mapping(address => uint256[]) private patientPrescriptions;
    mapping(uint256 => InsuranceClaim) public insuranceClaims;
    mapping(uint256 => uint256) public medicineIdDispensed;

    event PrescriptionCreated(uint256 indexed prescriptionId, address patient, uint256 medicineId);
    event MedicineDispensed(uint256 indexed prescriptionId, uint256 indexed tokenId, address patient);
    event InsuranceClaimCreated(uint256 indexed claimId, uint256 prescriptionId, address patient);
    event InsuranceClaimProcessed(uint256 indexed claimId, bool approved);

    function grantPat(address patient) public {
        _grantRole(PAT_ROLE, patient);
    }
    function grantIns(address insurer) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(INS_ROLE, insurer);
    }
    function grantDoc(address doctor) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(DOC_ROLE, doctor);
    }

    function createPrescription(
        address patient,
        uint256 medicineId,
        uint256 validityTime
    ) public onlyRole(DOC_ROLE) returns (uint256) {
        require(hasRole(PAT_ROLE, patient), "Not registered as patient");
        uint256 prescriptionId = _nextPrescriptionId++;
        uint256 validUntil = block.timestamp + validityTime;
        prescriptions[prescriptionId] = Prescription({
            prescriptionId: prescriptionId,
            patient: patient,
            doctor: msg.sender,
            medicineId: medicineId,
            validUntil: validUntil,
            isDispensed: false,
            prescriptionHash: keccak256(abi.encodePacked(patient, medicineId, block.timestamp))
        });
        patientPrescriptions[patient].push(prescriptionId);
        emit PrescriptionCreated(prescriptionId, patient, medicineId);
        return prescriptionId;
    }

    function validateLatestPrescription(address patient)
        public
        view
        returns (bool isValid, uint256 medicineId, uint prescriptionId)
    {
        uint256[] storage prescriptionIds = patientPrescriptions[patient];
        if (prescriptionIds.length == 0) {
            return (false, 0, 0);
        }
        for (uint i = prescriptionIds.length; i > 0; i--) {
            Prescription storage prescription = prescriptions[prescriptionIds[i - 1]];
            if (!prescription.isDispensed && block.timestamp <= prescription.validUntil) {
                return (true, prescription.medicineId, prescription.prescriptionId);
            }
        }
        return (false, 0, 0);
    }

    function dispenseMedicine(address patient) public onlyRole(PHAR_ROLE) {
        (bool valid, uint256 medicineId, uint prescriptionId) = validateLatestPrescription(patient);
        require(valid, "Invalid prescription");
        require(medicineIdToToken[medicineId].length > 0, "Medicine not Manufactured");
        uint i = medicineIdDispensed[medicineId];
        uint256 tokenId = 0;
        while(i < medicineIdToToken[medicineId].length) {
            uint256 candidateTokenId = medicineIdToToken[medicineId][i];
            if(isDrugExpired(candidateTokenId))
            {
                medicineIdDispensed[medicineId] = i + 1;
            }
            if(ownerOf(candidateTokenId) == msg.sender && !isDrugExpired(candidateTokenId)) {
                tokenId = candidateTokenId;
                break;
            }
            i++;
        }
        require(tokenId != 0, "No valid drug found");
        Prescription storage prescription = prescriptions[prescriptionId];
        Drug storage drug = drugs[tokenId];
        require(ownerOf(tokenId) == msg.sender, "Pharmacist doesn't own this drug");
        require(drug.status == DrugStatus.AtPharmacy, "Drug not at pharmacy");
        require(!isDrugExpired(tokenId), "Drug has expired");
        prescription.isDispensed = true;
        drug.status = DrugStatus.Dispensed;
        drug.currentHolder = patient;
        _burn(tokenId);
        emit MedicineDispensed(prescriptionId, tokenId, prescription.patient);
        emit DrugStatusUpdated(tokenId, DrugStatus.Dispensed);
    }

    function createInsuranceClaim(uint256 prescriptionId) public onlyRole(PAT_ROLE) returns (uint256) {
        Prescription storage prescription = prescriptions[prescriptionId];
        require(prescription.patient == msg.sender, "Not your prescription");
        require(prescription.isDispensed, "Prescription not dispensed yet");
        uint256 claimId = _nextClaimId++;
        insuranceClaims[claimId] = InsuranceClaim({
            claimId: claimId,
            prescriptionId: prescriptionId,
            isApproved: false
        });
        emit InsuranceClaimCreated(claimId, prescriptionId, msg.sender);
        return claimId;
    }

    function getMyPrescriptions() public view onlyRole(PAT_ROLE) returns (uint256[] memory) {
        return patientPrescriptions[msg.sender];
    }

    function processInsuranceClaim(uint256 claimId, bool approve) public onlyRole(INS_ROLE) {
        InsuranceClaim storage claim = insuranceClaims[claimId];
        require(claim.claimId != 0, "Claim does not exist");
        claim.isApproved = approve;
        emit InsuranceClaimProcessed(claimId, approve);
    }

    function getPendingClaims() public view onlyRole(INS_ROLE) returns (uint256[] memory) {
        uint256 pendingCount = 0;
        for (uint256 i = 1; i < _nextClaimId; i++) {
            if (insuranceClaims[i].claimId != 0 && !insuranceClaims[i].isApproved) {
                pendingCount++;
            }
        }
        uint256[] memory pendingClaims = new uint256[](pendingCount);
        uint256 index = 0;
        for (uint256 i = 1; i < _nextClaimId; i++) {
            if (insuranceClaims[i].claimId != 0 && !insuranceClaims[i].isApproved) {
                pendingClaims[index] = i;
                index++;
            }
        }
        return pendingClaims;
    }

    // Add getters for Prescription and InsuranceClaim if needed...
}