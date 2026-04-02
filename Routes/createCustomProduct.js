const express = require("express");
const router = express.Router();
const { createDiamondAndReturnVariant } = require("../Controller/createCustomProduct");

router.post("/", createDiamondAndReturnVariant);

module.exports = router;
