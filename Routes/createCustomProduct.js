const express = require("express");
const router = express.Router();
const { createCustomProduct } = require("../Controller/createCustomProduct");

app.post("/api/create-custom-product", createCustomProduct);

module.exports = router;