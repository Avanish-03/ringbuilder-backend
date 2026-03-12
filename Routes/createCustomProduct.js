const express = require("express");
const router = express.Router();
const { createCustomProduct } = require("../Controller/createCustomProduct");

router.post("/", createCustomProduct);

module.exports = router;
