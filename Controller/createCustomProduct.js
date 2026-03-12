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
      return res.status(400).json({
        success: false,
        step: "productCreate",
        errors: productData.userErrors
      });
    }

    const productId = productData.product.id;

    // =========================
    // 2️⃣ GET DEFAULT VARIANT
    // =========================
    const getVariantQuery = `
      query {
        product(id: "${productId}") {
          variants(first: 1) {
            edges { node { id } }
          }
        }
      }
    `;

    const variantFetchRes = await shopify.post("", { query: getVariantQuery });
    const defaultVariantId =
      variantFetchRes.data.data.product.variants.edges[0].node.id;

    // =========================
    // 3️⃣ UPDATE DEFAULT VARIANT
    // =========================
    const updateVariantMutation = `
      mutation {
        productVariantUpdate(input: {
          id: "${defaultVariantId}",
          price: "${price}"
        }) {
          productVariant { id price }
          userErrors { message }
        }
      }
    `;

    const updateRes = await shopify.post("", { query: updateVariantMutation });

    // debug
    if (updateRes.data.errors) {
      return res.status(500).json({
        success: false,
        step: "variantUpdate",
        graphqlErrors: updateRes.data.errors
      });
    }

    const updateData = updateRes.data.data.productVariantUpdate;

    if (!updateData) {
      return res.status(500).json({
        success: false,
        step: "variantUpdate",
        message: "Mutation returned no data",
        response: updateRes.data
      });
    }

    if (updateData.userErrors.length) {
      return res.status(400).json({
        success: false,
        step: "variantUpdate",
        errors: updateData.userErrors
      });
    }

    // =========================
    // 4️⃣ ADD IMAGE (optional)
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
    res.status(200).json({
      success: true,
      productId,
      variantId: defaultVariantId
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