const axios = require("axios");

const shopify = axios.create({
  baseURL: `https://${process.env.SHOPIFY_STORE}/admin/api/${process.env.SHOPIFY_API_VERSION}/graphql.json`,
  headers: {
    "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
    "Content-Type": "application/json",
  },
});

const storefront = process.env.SHOPIFY_STOREFRONT_TOKEN
  ? axios.create({
      baseURL: `https://${process.env.SHOPIFY_STORE}/api/${
        process.env.SHOPIFY_STOREFRONT_API_VERSION ||
        process.env.SHOPIFY_API_VERSION
      }/graphql.json`,
      headers: {
        "X-Shopify-Storefront-Access-Token":
          process.env.SHOPIFY_STOREFRONT_TOKEN,
        "Content-Type": "application/json",
      },
    })
  : null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createStepError = ({
  step,
  message,
  statusCode = 500,
  graphqlErrors,
  userErrors,
  errorCode,
}) => {
  const error = new Error(message);
  error.step = step;
  error.statusCode = statusCode;
  error.graphqlErrors = graphqlErrors;
  error.userErrors = userErrors;
  error.errorCode = errorCode;
  return error;
};

const getGraphqlErrors = (response) => response?.data?.errors || null;

const describeGraphqlErrors = (graphqlErrors, fallbackMessage) => {
  if (!graphqlErrors?.length) {
    return fallbackMessage;
  }

  const missingAccess = graphqlErrors
    .map((error) => error.extensions?.requiredAccess)
    .filter(Boolean);

  if (missingAccess.length) {
    return `Shopify app access is missing ${missingAccess.join(
      ", "
    )}. Reinstall or update the app scopes, then retry.`;
  }

  return graphqlErrors.map((error) => error.message).join("; ") || fallbackMessage;
};

const getAccessDeniedErrorCode = (graphqlErrors) => {
  const requiredAccess = graphqlErrors
    .map((error) => error.extensions?.requiredAccess || "")
    .join(" ");

  if (requiredAccess.includes("write_publications")) {
    return "SHOPIFY_WRITE_PUBLICATIONS_REQUIRED";
  }

  if (requiredAccess.includes("read_publications")) {
    return "SHOPIFY_READ_PUBLICATIONS_REQUIRED";
  }

  return "SHOPIFY_ACCESS_DENIED";
};

const ensureNoGraphqlErrors = (response, step, message) => {
  const graphqlErrors = getGraphqlErrors(response);

  if (graphqlErrors) {
    const isAccessDenied = graphqlErrors.some(
      (error) => error.extensions?.code === "ACCESS_DENIED"
    );

    throw createStepError({
      step,
      message: describeGraphqlErrors(graphqlErrors, message),
      statusCode: isAccessDenied ? 403 : 500,
      graphqlErrors,
      errorCode: isAccessDenied
        ? getAccessDeniedErrorCode(graphqlErrors)
        : "SHOPIFY_GRAPHQL_ERROR",
    });
  }
};

const ensureNoUserErrors = (payload, step, message) => {
  const userErrors = payload?.userErrors || payload?.mediaUserErrors || [];

  if (userErrors.length) {
    throw createStepError({
      step,
      message,
      statusCode: 400,
      userErrors,
    });
  }
};

const waitForStorefrontVariantAvailability = async (variantId) => {
  if (!storefront) {
    // If no storefront token, just wait a few seconds
    await sleep(5000);
    return { storefrontVerified: false };
  }

  const storefrontVariantQuery = `
    query StorefrontVariant($id: ID!) {
      node(id: $id) {
        ... on ProductVariant {
          id
          availableForSale
          product {
            id
            handle
          }
        }
      }
    }
  `;

  for (let attempt = 0; attempt < 20; attempt++) {
    const storefrontRes = await storefront.post("", {
      query: storefrontVariantQuery,
      variables: { id: variantId },
    });

    const graphqlErrors = getGraphqlErrors(storefrontRes);

    if (graphqlErrors) {
      throw createStepError({
        step: "verifyStorefrontAvailability",
        message: describeGraphqlErrors(
          graphqlErrors,
          "Unable to verify storefront availability for the custom variant"
        ),
        statusCode: 500,
        graphqlErrors,
        errorCode: "SHOPIFY_STOREFRONT_GRAPHQL_ERROR",
      });
    }

    const variantNode = storefrontRes.data.data?.node;

    if (variantNode?.id === variantId && variantNode.availableForSale) {
      // Wait a tiny bit more to ensure AJAX cart works
      await sleep(1000);
      return {
        storefrontVerified: true,
        storefrontProductHandle: variantNode.product?.handle || null,
      };
    }

    // Wait 2 seconds before retry
    await sleep(2000);
  }

  throw createStepError({
    step: "verifyStorefrontAvailability",
    statusCode: 504,
    errorCode: "SHOPIFY_STOREFRONT_PROPAGATION_TIMEOUT",
    message:
      "Product variant was created but storefront availability did not propagate in time. Try again after a few seconds.",
  });
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

    ensureNoGraphqlErrors(productRes, "productCreate", "Unable to create custom product");

    const productData = productRes.data.data.productCreate;
    ensureNoUserErrors(productData, "productCreate", "Shopify rejected the custom product request");

    const productId = productData.product.id;

    const variantQuery = `
      query GetProductVariant($productId: ID!) {
        product(id: $productId) {
          variants(first: 1) {
            nodes {
              id
              legacyResourceId
            }
          }
        }
      }
    `;

    const variantRes = await shopify.post("", {
      query: variantQuery,
      variables: { productId },
    });

    ensureNoGraphqlErrors(variantRes, "getDefaultVariant", "Unable to fetch the default variant for the custom product");

    const defaultVariant = variantRes.data.data?.product?.variants?.nodes?.[0] || null;
    const defaultVariantId = defaultVariant?.id;
    const defaultVariantLegacyId = defaultVariant?.legacyResourceId;

    if (!defaultVariantId) {
      throw createStepError({
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

    const updateRes = await shopify.post("", {
      query: updateMutation,
      variables: {
        productId,
        variants: [
          {
            id: defaultVariantId,
            price: String(price),
            inventoryPolicy: "CONTINUE",
          },
        ],
      },
    });

    ensureNoGraphqlErrors(updateRes, "variantUpdate", "Unable to update the custom product variant");

    ensureNoUserErrors(updateRes.data.data?.productVariantsBulkUpdate, "variantUpdate", "Shopify rejected the custom variant update");

    // ✅ Removed publish step to avoid write_publications error
    // await publishProductToCurrentChannel(productId);

    const storefrontAvailability = await waitForStorefrontVariantAvailability(defaultVariantId);

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

      const mediaRes = await shopify.post("", {
        query: mediaMutation,
        variables: {
          productId,
          media: [
            {
              originalSource: image,
              mediaContentType: "IMAGE",
            },
          ],
        },
      });

      ensureNoGraphqlErrors(mediaRes, "mediaCreate", "Unable to attach media to the custom product");

      ensureNoUserErrors(mediaRes.data.data?.productCreateMedia, "mediaCreate", "Shopify rejected the custom product media");
    }

    return res.json({
      success: true,
      message: "Custom product created successfully",
      productId,
      variantId: defaultVariantId,
      variantLegacyId: defaultVariantLegacyId,
      publishedToCurrentChannel: false,
      storefrontVerified: storefrontAvailability.storefrontVerified,
      storefrontProductHandle: storefrontAvailability.storefrontProductHandle,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      step: error.step,
      code: error.errorCode || "CUSTOM_PRODUCT_CREATE_FAILED",
      message: error.message || "FAILED",
      userErrors: error.userErrors,
      graphqlErrors: error.graphqlErrors,
      error: error.response?.data || error.message,
    });
  }
};

module.exports = { createCustomProduct };
