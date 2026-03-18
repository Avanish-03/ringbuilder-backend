const axios = require("axios");

const shopify = axios.create({
  baseURL: `https://${process.env.SHOPIFY_STORE}/admin/api/${process.env.SHOPIFY_API_VERSION}/graphql.json`,
  headers: {
    "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
    "Content-Type": "application/json",
  },
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const graphqlRequest = async (query, variables = {}) => {
  const response = await shopify.post("", { query, variables });

  if (response.data.errors) {
    const error = new Error("Shopify GraphQL error");
    error.details = response.data.errors;
    throw error;
  }

  return response.data.data;
};

const createCustomProduct = async (req, res) => {
  try {
    const { diamondId, shopify_variant_id, price, title, image } = req.body;

    if (!diamondId || !shopify_variant_id || !price || !title) {
      return res.status(400).json({
        success: false,
        message: "diamondId, shopify_variant_id, price, and title are required",
      });
    }

    const createProductMutation = `
      mutation CreateProduct($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product {
            id
            title
            status
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const productCreateData = await graphqlRequest(createProductMutation, {
      product: {
        title: `${title} (D:${diamondId} S:${shopify_variant_id})`,
        status: "ACTIVE",
      },
    });

    const productData = productCreateData.productCreate;

    if (productData.userErrors.length) {
      return res.status(400).json({
        success: false,
        step: "productCreate",
        userErrors: productData.userErrors,
      });
    }

    const productId = productData.product.id;

    const variantQuery = `
      query GetProductVariant($productId: ID!) {
        product(id: $productId) {
          variants(first: 1) {
            nodes {
              id
            }
          }
        }
      }
    `;

    let defaultVariantId = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const variantData = await graphqlRequest(variantQuery, { productId });
      defaultVariantId = variantData.product?.variants?.nodes?.[0]?.id || null;

      if (defaultVariantId) {
        break;
      }

      await sleep(800);
    }

    if (!defaultVariantId) {
      return res.status(500).json({
        success: false,
        step: "getDefaultVariant",
        message: "Default variant not found for created product",
      });
    }

    const updateMutation = `
      mutation UpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          product {
            id
          }
          productVariants {
            id
            price
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const updateResult = await graphqlRequest(updateMutation, {
      productId,
      variants: [
        {
          id: defaultVariantId,
          price: String(price),
        },
      ],
    });

    const updateData = updateResult.productVariantsBulkUpdate;

    if (updateData.userErrors.length) {
      return res.status(400).json({
        success: false,
        step: "variantUpdate",
        userErrors: updateData.userErrors,
      });
    }

    if (image) {
      const mediaMutation = `
        mutation CreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
          productCreateMedia(productId: $productId, media: $media) {
            media {
              alt
              mediaContentType
              status
            }
            mediaUserErrors {
              field
              message
            }
            product {
              id
            }
          }
        }
      `;

      const mediaResult = await graphqlRequest(mediaMutation, {
        productId,
        media: [
          {
            originalSource: image,
            mediaContentType: "IMAGE",
          },
        ],
      });

      const mediaData = mediaResult.productCreateMedia;

      if (mediaData.mediaUserErrors.length) {
        return res.status(400).json({
          success: false,
          step: "mediaCreate",
          userErrors: mediaData.mediaUserErrors,
        });
      }
    }

    await sleep(3000);

    return res.json({
      success: true,
      message: "Custom product created successfully",
      productId,
      variantId: defaultVariantId,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "FAILED",
      error: error.details || error.response?.data || error.message,
    });
  }
};

module.exports = { createCustomProduct };
