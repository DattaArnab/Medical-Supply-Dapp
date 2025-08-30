// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

const JAN_1ST_2030 = 1893456000;

const ONE_GWEI = 1_000_000_000n;

module.exports = buildModule("MedicalSupplyChainModule", (m) => {
  // Deploy the PrescriptionAndInsuranceManager contract
  // This contract inherits from MedicalDrugNFT, so it includes all functionality
  const medicalSupplyChain = m.contract("PrescriptionAndInsuranceManager", []);

  return { 
    medicalSupplyChain 
  };
});
