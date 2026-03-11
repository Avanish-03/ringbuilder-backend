const axios = require("axios");

const shopify = axios.create({
  baseURL: `https://${process.env.SHOPIFY_STORE}/admin/api/${process.env.SHOPIFY_API_VERSION}/graphql.json`,
  headers: {
    "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
    "Content-Type": "application/json"
  }
});

const createCustomProduct = async (req, res) => {
  try {
    const { diamondId, shopify_variant_id, price, title, image } = req.body;

    // =========================
    // 1️⃣ CREATE PRODUCT
    // =========================
    const createProductMutation = `
      mutation {
        productCreate(product: {
          title: "${title} (D:${diamondId} S:${shopify_variant_id})",
          status: ACTIVE
        }) {
          product { id }
          userErrors { message }
        }
      }
    `;

    const productRes = await shopify.post("", { query: createProductMutation });
    const productData = productRes.data.data.productCreate;

    if (productData.userErrors.length) {
      return res.status(400).json({ step: "productCreate", errors: productData.userErrors });
    }

    const productId = productData.product.id;

    // =========================
    // 2️⃣ ADD VARIANT
    // =========================
    const variantMutation = `
      mutation {
        productVariantsBulkCreate(
          productId: "${productId}",
          variants: [{
            price: "${price}"
          }]
        ) {
          productVariants { id }
          userErrors { message }
        }
      }
    `;

    const variantRes = await shopify.post("", { query: variantMutation });
    const variantData = variantRes.data.data.productVariantsBulkCreate;

    if (variantData.userErrors.length) {
      return res.status(400).json({ step: "variantCreate", errors: variantData.userErrors });
    }

    const variantId = variantData.productVariants[0].id;

    // =========================
    // 3️⃣ ADD IMAGE (optional)
    // =========================
    if (image) {
      const mediaMutation = `
        mutation {
          productCreateMedia(
            productId: "${productId}",
            media: [{
              originalSource: "${image}",
              mediaContentType: IMAGE
            }]
          ) {
            media { alt }
            mediaUserErrors { message }
          }
        }
      `;

      await shopify.post("", { query: mediaMutation });
    }

    // =========================
    // ✅ SUCCESS
    // =========================
    res.json({
      success: true,
      productId,
      variantId
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "FAILED",
      error: error.response?.data || error.message
    });
  }
};

module.exports = { createCustomProduct };