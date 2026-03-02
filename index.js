const express = require("express");
const cors = require("cors");
require("dotenv").config();
const diamondsRoutes = require("./Routes/diamonds");
const settingsRoutes = require("./Routes/settings");


const app = express();
app.use(cors());
app.use(express.json());

app.get("/" , (req,res) => {
    res.send("HELLO THIS IS THE RING BUILDER");
})

app.use("/api/diamonds",diamondsRoutes);
app.use("/api/settings",settingsRoutes);


const PORT = 5000;
app.listen(PORT, () => {
    console.log(`Server is runing on http://localhost:${PORT}/`);
});

