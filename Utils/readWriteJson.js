const fs = require("fs");
const path = require("path");
const dbPath = path.join(__dirname,"../Config/db.json");

const readData = () => JSON.parse(fs.readFileSync(dbPath,"utf-8"));
const writeData = (data) => fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));

module.exports = {readData,writeData};
