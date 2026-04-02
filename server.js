const express = require("express");
const cors = require("cors");
require("dotenv").config();

const diamondsRoutes = require("./Routes/diamonds");
const settingsRoutes = require("./Routes/settings");
const customProductsRoutes = require("./Routes/createCustomProduct");

const app = express();

const corsOptions = {
  origin: [
    "http://localhost:9292",
    "http://localhost:5173",
    "http://localhost:3000",
    "https://ringsofolight.com",
    "https://ringsofolight.myshopify.com",
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.use(express.json());

app.get("/", (req, res) => {
  res.send("HELLO THIS IS THE RING BUILDER");
});

app.use("/api/diamonds", diamondsRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/custom-products", customProductsRoutes);
app.use("/api/create-custom-product", customProductsRoutes);
app.use("/api/createCustomProduct", customProductsRoutes);
app.use("/api/create-diamond-and-return-variant", customProductsRoutes);
app.use("/api/createDiamondAndReturnVariant", customProductsRoutes);

module.exports = app;
