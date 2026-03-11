const axios = require("axios");

const createCustomProduct = async (req, res) => {
  try {
    const { diamondId, shopify_variant_id, price, title, image } = req.body;

    const query = `
      mutation CreateProduct($input: ProductInput!) {
        productCreate(input: $input) {
          product {
            id
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

    const variantId =
      response.data.data.productCreate.product.variants.edges[0].node.id;

    res.json({ variantId });

  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ message: "Product creation failed" });
  }
};

module.exports = { createCustomProduct };