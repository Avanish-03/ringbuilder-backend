const express = require("express");
const cors = require("cors");
require("dotenv").config();
const diamondsRoutes = require("./Routes/diamonds");
const settingsRoutes = require("./Routes/settings");
const { createCustomProduct } = require("./Controller/createCustomProduct");


const app = express();
app.use(cors());
app.use(express.json());

app.get("/" , (req,res) => {
    res.send("HELLO THIS IS THE RING BUILDER");
})

app.use("/api/diamonds",diamondsRoutes);
app.use("/api/settings",settingsRoutes);
app.use("/api/custom-products", createCustomProduct);


const PORT = 5000;
app.listen(PORT, () => {
    console.log(`Server is runing on http://localhost:${PORT}/`);
});

