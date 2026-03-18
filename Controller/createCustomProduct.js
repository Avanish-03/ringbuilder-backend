const axios = require("axios");

const shopify = axios.create({
  baseURL: `https://${process.env.SHOPIFY_STORE}/admin/api/${process.env.SHOPIFY_API_VERSION}/graphql.json`,
  headers: {
    "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
    "Content-Type": "application/json",
  },
});

const createCustomProduct = async (req, res) => {
  try {
    const { diamondId, shopify_variant_id, price, title, image } = req.body;

    if (!diamondId || !shopify_variant_id || !price || !title) {
      return res.status(400).json({
        success: false,
        message: "diamondId, shopify_variant_id, price, and title are required",
      });
    }

    // 1. Create product
    const createProductMutation = `
      mutation CreateProduct($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product {
            id
            title
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const createProductVariables = {
      product: {
        title: `${title} (D:${diamondId} S:${shopify_variant_id})`,
        status: "ACTIVE",
      },
    };

    const productRes = await shopify.post("", {
      query: createProductMutation,
      variables: createProductVariables,
    });

    if (productRes.data.errors) {
      return res.status(500).json({
        success: false,
        step: "productCreate",
        graphqlErrors: productRes.data.errors,
      });
    }

    const productData = productRes.data.data.productCreate;

    if (productData.userErrors.length) {
      return res.status(400).json({
        success: false,
        step: "productCreate",
        userErrors: productData.userErrors,
      });
    }

    const productId = productData.product.id;

    // 2. Get default variant
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

    const variantRes = await shopify.post("", {
      query: variantQuery,
      variables: { productId },
    });

    if (variantRes.data.errors) {
      return res.status(500).json({
        success: false,
        step: "getDefaultVariant",
        graphqlErrors: variantRes.data.errors,
      });
    }

    const defaultVariantId =
      variantRes.data.data.product?.variants?.nodes?.[0]?.id;

    if (!defaultVariantId) {
      return res.status(500).json({
        success: false,
        step: "getDefaultVariant",
        message: "Default variant not found for created product",
      });
    }

    // 3. Update variant price
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

    const updateVariables = {
      productId,
      variants: [
        {
          id: defaultVariantId,
          price: String(price),
        },
      ],
    };

    const updateRes = await shopify.post("", {
      query: updateMutation,
      variables: updateVariables,
    });

    if (updateRes.data.errors) {
      return res.status(500).json({
        success: false,
        step: "variantUpdate",
        graphqlErrors: updateRes.data.errors,
      });
    }

    const updateData = updateRes.data.data.productVariantsBulkUpdate;

    if (updateData.userErrors.length) {
      return res.status(400).json({
        success: false,
        step: "variantUpdate",
        userErrors: updateData.userErrors,
      });
    }

    // 4. Add product image
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

      const mediaVariables = {
        productId,
        media: [
          {
            originalSource: image,
            mediaContentType: "IMAGE",
          },
        ],
      };

      const mediaRes = await shopify.post("", {
        query: mediaMutation,
        variables: mediaVariables,
      });

      if (mediaRes.data.errors) {
        return res.status(500).json({
          success: false,
          step: "mediaCreate",
          graphqlErrors: mediaRes.data.errors,
        });
      }

      const mediaData = mediaRes.data.data.productCreateMedia;

      if (mediaData.mediaUserErrors.length) {
        return res.status(400).json({
          success: false,
          step: "mediaCreate",
          userErrors: mediaData.mediaUserErrors,
        });
      }
    }

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
      error: error.response?.data || error.message,
    });
  }
};

module.exports = { createCustomProduct };
