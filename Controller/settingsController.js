const axios = require("axios");

const SHOP = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION;

const headers = {
  "X-Shopify-Access-Token": TOKEN,
  "Content-Type": "application/json"
};

// =============================
// GET ALL SETTINGS (PRODUCTS)
// =============================
const getSettings = async (req, res) => {
  try {
    const response = await axios.get(
      `https://${SHOP}/admin/api/${VERSION}/products.json?limit=250`,
      { headers }
    );

    const products = response.data.products;

    const formatted = products.map((p) => {
      const variant = p.variants?.[0] || {};
      const image = p.images?.[0]?.src || "";

      return {
        // BASIC
        id: p.id,
        title: p.title,
        handle: p.handle,
        status: p.status,
        description: p.body_html,

        // ORGANIZATION
        vendor: p.vendor,
        product_type: p.product_type,
        tags: p.tags ? p.tags.split(",").map(t => t.trim()) : [],

        // MEDIA
        featured_image: image,
        images: p.images?.map(img => img.src) || [],

        // PRICING
        price: Number(variant.price || 0),
        compare_at_price: Number(variant.compare_at_price || 0),
        currency_symbol: "₹",
        taxable: variant.taxable,

        // INVENTORY
        sku: variant.sku,
        barcode: variant.barcode,
        inventory_quantity: variant.inventory_quantity,
        inventory_management: variant.inventory_management,
        inventory_policy: variant.inventory_policy,

        // SHIPPING
        requires_shipping: variant.requires_shipping,
        weight: variant.weight,
        weight_unit: variant.weight_unit,

        // SHOPIFY IDS
        shopify_product_id: p.id,
        shopify_variant_id: variant.id,

        // VARIANTS (ALL)
        variants: p.variants?.map(v => ({
          id: v.id,
          title: v.title,
          price: Number(v.price || 0),
          compare_at_price: Number(v.compare_at_price || 0),
          sku: v.sku,
          barcode: v.barcode,
          inventory_quantity: v.inventory_quantity,
          weight: v.weight,
          weight_unit: v.weight_unit,
        })) || [],

        // SEO
        seo_title: p.title,
        seo_description: p.body_html?.replace(/<[^>]+>/g, "").slice(0, 160),

        // DATES
        created_at: p.created_at,
        updated_at: p.updated_at,
      };
    });

    res.json(formatted);

  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ message: "Failed to fetch Shopify products" });
  }
};

// =============================
// GET SETTING BY ID
// =============================
const getSettingById = async (req, res) => {
  try {
    const response = await axios.get(
      `https://${SHOP}/admin/api/${VERSION}/products/${req.params.id}.json`,
      { headers }
    );

    const p = response.data.product;
    const variant = p.variants?.[0] || {};
    const image = p.images?.[0]?.src || "";

    const formatted = {
      id: p.id,
      title: p.title,
      handle: p.handle,
      status: p.status,
      description: p.body_html,

      vendor: p.vendor,
      product_type: p.product_type,
      tags: p.tags ? p.tags.split(",").map(t => t.trim()) : [],

      featured_image: image,
      images: p.images?.map(img => img.src) || [],

      price: Number(variant.price || 0),
      compare_at_price: Number(variant.compare_at_price || 0),
      currency_symbol: "₹",
      taxable: variant.taxable,

      sku: variant.sku,
      barcode: variant.barcode,
      inventory_quantity: variant.inventory_quantity,
      inventory_management: variant.inventory_management,
      inventory_policy: variant.inventory_policy,

      requires_shipping: variant.requires_shipping,
      weight: variant.weight,
      weight_unit: variant.weight_unit,

      shopify_product_id: p.id,
      shopify_variant_id: variant.id,

      variants: p.variants?.map(v => ({
        id: v.id,
        title: v.title,
        price: Number(v.price || 0),
        compare_at_price: Number(v.compare_at_price || 0),
        sku: v.sku,
        barcode: v.barcode,
        inventory_quantity: v.inventory_quantity,
        weight: v.weight,
        weight_unit: v.weight_unit,
      })) || [],

      seo_title: p.title,
      seo_description: p.body_html?.replace(/<[^>]+>/g, "").slice(0, 160),

      created_at: p.created_at,
      updated_at: p.updated_at,
    };

    res.json(formatted);

  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(404).json({ message: "Setting not found" });
  }
};

// =============================
// FILTER SETTINGS
// =============================
const getFilteredSetting = async (req, res) => {
  try {
    const { shape, metal, price_min, price_max } = req.body;

    const response = await axios.get(
      `https://${SHOP}/admin/api/${VERSION}/products.json?limit=250`,
      { headers }
    );

    let products = response.data.products;

    let formatted = products.map((p) => {
      const variant = p.variants?.[0] || {};

      return {
        id: p.id,
        title: p.title,
        image: p.images?.[0]?.src || "",
        price: Number(variant.price || 0),
        tags: p.tags ? p.tags.split(",").map(t => t.trim().toLowerCase()) : [],
        shopify_variant_id: variant.id,
      };
    });

    // PRICE FILTER
    if (price_min !== undefined) {
      formatted = formatted.filter(p => p.price >= Number(price_min));
    }

    if (price_max !== undefined) {
      formatted = formatted.filter(p => p.price <= Number(price_max));
    }

    // SHAPE FILTER
    if (shape) {
      formatted = formatted.filter(p =>
        p.tags.includes(`shape_${shape.toLowerCase()}`)
      );
    }

    // METAL FILTER
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

module.exports = {
  getSettings,
  getSettingById,
  getFilteredSetting
};