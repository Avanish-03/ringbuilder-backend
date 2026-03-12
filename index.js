const express = require("express");
const cors = require("cors");
require("dotenv").config();

const diamondsRoutes = require("./Routes/diamonds");
const settingsRoutes = require("./Routes/settings");
const customProductsRoutes = require("./Routes/customProducts");

const app = express();

app.use(cors({ origin: true }));
app.use(express.json());

app.get("/", (req, res) => {
  res.send("HELLO THIS IS THE RING BUILDER");
});

app.use("/api/diamonds", diamondsRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/custom-products", customProductsRoutes);

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}/`);
});
