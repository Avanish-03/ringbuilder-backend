const axios = require("axios");

const getSettings = async (req, res) => {
  try {
    const response = await axios.get(
      `https://${process.env.SHOPIFY_STORE}/admin/api/${process.env.SHOPIFY_API_VERSION}/products.json`,
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
        },
      }
    );

    const products = response.data.products;

    // format Shopify product to match your old structure
    const formatted = products.map((p) => ({
      id: p.id,
      title: p.title,
      display_name: p.title,
      image: p.images[0]?.src || "",
      price: p.variants[0]?.price || 0,
      currency_symbol: "$",
      sku: p.variants[0]?.sku || "",
      shopify_product_id: p.id,
      shopify_variant_id: p.variants[0]?.id,
    }));

    res.json(formatted);
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ message: "Failed to fetch Shopify products" });
  }
};

const getSettingById = async (req, res) => {
  try {
    const response = await axios.get(
      `https://${process.env.SHOPIFY_STORE}/admin/api/${process.env.SHOPIFY_API_VERSION}/products/${req.params.id}.json`,
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
        },
      }
    );

    const p = response.data.product;

    const formatted = {
      id: p.id,
      title: p.title,
      display_name: p.title,
      image: p.images[0]?.src || "",
      price: p.variants[0]?.price || 0,
      currency_symbol: "$",
      sku: p.variants[0]?.sku || "",
      shopify_product_id: p.id,
      shopify_variant_id: p.variants[0]?.id,
    };

    res.json(formatted);
  } catch (error) {
    res.status(404).json({ message: "Setting not found" });
  }
};

const getFilteredSetting = async (req, res) => {
  try {
    const { shape, metal, price_min, price_max } = req.body;

    const response = await axios.get(
      `https://${process.env.SHOPIFY_STORE}/admin/api/${process.env.SHOPIFY_API_VERSION}/products.json?limit=250`,
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
        },
      }
    );

    let products = response.data.products;

    let formatted = products.map((p) => {
      const variant = p.variants[0];

      return {
        id: p.id,
        title: p.title,
        image: p.images[0]?.src || "",
        price: Number(variant?.price || 0),
        metal: p.tags, // we will check inside tags
        tags: p.tags.split(",").map(t => t.trim().toLowerCase()),
        shopify_variant_id: variant?.id,
      };
    });

    // 🔹 PRICE FILTER
    if (price_min !== undefined) {
      formatted = formatted.filter(p => p.price >= Number(price_min));
    }

    if (price_max !== undefined) {
      formatted = formatted.filter(p => p.price <= Number(price_max));
    }

    // 🔹 SHAPE FILTER
    if (shape) {
      formatted = formatted.filter(p =>
        p.tags.includes(`shape_${shape.toLowerCase()}`)
      );
    }

    // 🔹 METAL FILTER
    if (metal) {
      const cleanMetal = metal.toLowerCase().replace(/\s+/g, "_").replace("-", "_");
      formatted = formatted.filter(p =>
        p.tags.includes(`metal_${cleanMetal}`)
      );
    }

    res.json(formatted);

  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ message: "Filtering failed" });
  }
};

module.exports = { getSettings, getSettingById, getFilteredSetting };