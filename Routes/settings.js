const express = require("express");
const router = express.Router();
const {
    getSettings,
    getSettingById,
    // getFilteredSetting
} = require("../Controller/settingsController");

router.get("/", getSettings);
router.get("/:id", getSettingById);
// router.post("/filter",getFilteredSetting);

module.exports = router;


