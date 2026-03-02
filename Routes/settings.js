const express = require("express");
const router = express.Router();
const {
    getSettings,
    getSettingById,
} = require("../Controller/settingsController");

router.get("/", getSettings);
router.get("/:id", getSettingById);

module.exports = router;


