const express = require("express");
const router = express.Router();
const {getDiamond , getDiamondById , getFilteredDiamond} = require("../Controller/diamondsController");

router.get("/",getDiamond);
router.get("/:id",getDiamondById);
router.post("/filter",getFilteredDiamond);

module.exports = router;


