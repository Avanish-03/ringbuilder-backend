const express = require("express");
const router = express.Router();
const {getDiamond , getDiamondById , getFilteredDiamond} = require("../Controller/diamondsController");
const { createDiamondAndReturnVariant } = require("../Controller/createCustomProduct");

router.get("/",getDiamond);
router.get("/:id",getDiamondById);
router.post("/filter",getFilteredDiamond);
router.post("/create-and-return-variant", createDiamondAndReturnVariant);

module.exports = router;


