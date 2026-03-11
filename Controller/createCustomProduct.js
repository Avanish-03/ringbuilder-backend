const axios = require("axios");

const createCustomProduct = async (req, res) => {
  try {
    const { diamondId, shopify_variant_id, price, title, image } = req.body;

    const query = `
      mutation CreateProduct($input: ProductInput!) {
        productCreate(input: $input) {
          product {
            id
            title
            variants(first: 1) {
              edges { node { id } }
            }
          }
          userErrors { message }
        }
      }
    `;

    const variables = {
      input: {
        title: `${title} (D:${diamondId} S:${shopify_variant_id})`,
        status: "ACTIVE",
        images: image ? [{ src: image }] : [],
        variants: [
          {
            price: String(price),
            inventoryManagement: null
          }
        ]
      }
    };

    const response = await axios.post(
      `https://${process.env.SHOPIFY_STORE}/admin/api/${process.env.SHOPIFY_API_VERSION}/graphql.json`,
      { query, variables },
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
          "Content-Type": "application/json"
        }
      }
    );

    const result = response?.data?.data?.productCreate;
    const product = result?.product;
    const variantId = product?.variants?.edges?.[0]?.node?.id;

    // ❌ Shopify user errors
    if (result?.userErrors?.length) {
      return res.status(400).json({
        success: false,
        userErrors: result.userErrors,
        shopify: response.data
      });
    }

    // ❌ No product created
    if (!product) {
      return res.status(500).json({
        success: false,
        message: "Product not created",
        shopify: response.data
      });
    }

    res.status(200).json({
      success: true,
      productId: product.id,
      variantId,
      shopify: response.data
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Product creation failed",
      error: error.response?.data || error.message
    });
  }
};

module.exports = { createCustomProduct };