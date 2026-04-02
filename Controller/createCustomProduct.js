const axios = require("axios");

// Shopify client
const shopify = axios.create({
  baseURL: `https://${process.env.SHOPIFY_STORE}/admin/api/${process.env.SHOPIFY_API_VERSION}/graphql.json`,
  headers: {
    "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
    "Content-Type": "application/json",
  },
});

// waiting secconds and retries for variant to become available for sale after creation
const WAIT_INTERVAL_MS = 1500;
const WAIT_RETRIES = 15;
// GraphQL operations
const GQL_FIND_VARIANT_BY_SKU = `
  query FindVariantBySku($query: String!) {
    productVariants(first: 1, query: $query) {
      nodes {
        id
        legacyResourceId
        sku
        product {
          id
          legacyResourceId
          handle
        }
      }
    }
  }
`;

const GQL_CREATE_PRODUCT = `
  mutation CreateProduct($product: ProductCreateInput!) {
    productCreate(product: $product) {
      product {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const GQL_PUBLISH_PRODUCT_TO_CURRENT_CHANNEL = `
  mutation PublishProductToCurrentChannel($id: ID!) {
    publishablePublishToCurrentChannel(id: $id) {
      publishable {
        ... on Product {
          id
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const GQL_GET_PRODUCT_VARIANT = `
  query GetProductVariant($productId: ID!) {
    product(id: $productId) {
      id
      handle
      legacyResourceId
      variants(first: 1) {
        nodes {
          id
          legacyResourceId
          availableForSale
        }
      }
    }
  }
`;

const GQL_UPDATE_VARIANT = `
  mutation UpdateVariant($productId: ID!, $variantId: ID!, $price: Money!, $sku: String!) {
    productVariantsBulkUpdate(
      productId: $productId
      variants: [{
        id: $variantId
        price: $price
        inventoryPolicy: CONTINUE
        inventoryItem: { tracked: false, sku: $sku }
      }]
    ) {
      productVariants {
        id
        legacyResourceId
        availableForSale
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const GQL_CREATE_MEDIA = `
  mutation CreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
    productCreateMedia(productId: $productId, media: $media) {
      media {
        status
      }
      mediaUserErrors {
        field
        message
      }
    }
  }
`;

const GQL_CHECK_VARIANT = `
  query CheckVariant($id: ID!) {
    node(id: $id) {
      ... on ProductVariant {
        id
        legacyResourceId
        availableForSale
      }
    }
  }
`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Shared helpers
const createStepError = ({ message, statusCode = 500, graphqlErrors, userErrors }) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.graphqlErrors = graphqlErrors;
  error.userErrors = userErrors;
  return error;
};

const getGraphqlErrors = (response) => response?.data?.errors || null;

const ensureNoGraphqlErrors = (response, message) => {
  const graphqlErrors = getGraphqlErrors(response);
  if (graphqlErrors?.length) {
    throw createStepError({ message, graphqlErrors });
  }
};

const ensureNoUserErrors = (payload, message) => {
  const userErrors = payload?.userErrors || [];
  if (userErrors.length) {
    throw createStepError({ message, userErrors, statusCode: 400 });
  }
};

const ensureValue = (value, message) => {
  if (value === undefined || value === null) {
    throw createStepError({ message });
  }
  return value;
};

const runShopifyQuery = async (query, variables, errorMessage) => {
  const response = await shopify.post("", { query, variables });
  ensureNoGraphqlErrors(response, errorMessage);
  return response.data.data;
};

const buildDiamondTitle = (diamond, sku) => {
  const parts = [diamond.carat, diamond.shape, diamond.color, diamond.clarity]
    .filter((value) => value !== undefined && value !== null && String(value).trim() !== "")
    .map((value, index) => (index === 0 ? `${value}CT` : String(value).trim()));

  return parts.join(" ") || `Diamond ${sku}`;
};

const formatVariantResponse = ({ variant, product }) => ({
  success: true,
  variantId: variant?.legacyResourceId ? String(variant.legacyResourceId) : variant?.id,
  adminVariantId: variant?.id || null,
  productId: product?.legacyResourceId ? String(product.legacyResourceId) : product?.id,
  adminProductId: product?.id || null,
  storefrontProductId: product?.legacyResourceId ? String(product.legacyResourceId) : null,
  handle: product?.handle || null,
});

const findVariantBySKU = async (sku) => {
  const data = await runShopifyQuery(
    GQL_FIND_VARIANT_BY_SKU,
    { query: `sku:${sku}` },
    "SKU lookup failed"
  );

  return data?.productVariants?.nodes?.[0] || null;
};

const createProduct = async (title, sku) => {
  const data = await runShopifyQuery(
    GQL_CREATE_PRODUCT,
    {
      product: {
        title,
        vendor: "Custom Diamonds",
        productType: "Diamond",
        tags: ["diamond", `sku:${sku}`],
        status: "ACTIVE",
      },
    },
    "Product create failed"
  );

  ensureNoUserErrors(data?.productCreate, "Product user error");

  return ensureValue(data?.productCreate?.product?.id, "Product was created without an id");
};

const getProductAndVariant = async (productId) => {
  const data = await runShopifyQuery(
    GQL_GET_PRODUCT_VARIANT,
    { productId },
    "Variant fetch failed"
  );

  const product = data?.product;
  const variant = product?.variants?.nodes?.[0];

  ensureValue(product?.id, "Product fetch failed after creation");
  ensureValue(variant?.id, "Product variant was not available after product creation");

  return { product, variant };
};

const publishProduct = async (productId) => {
  const data = await runShopifyQuery(
    GQL_PUBLISH_PRODUCT_TO_CURRENT_CHANNEL,
    {
      id: productId,
    },
    "Product publish failed"
  );

  ensureNoUserErrors(data?.publishablePublishToCurrentChannel, "Product publish user error");
};

const updateVariant = async ({ productId, variantId, price, sku }) => {
  const data = await runShopifyQuery(
    GQL_UPDATE_VARIANT,
    {
      productId,
      variantId,
      price: String(price),
      sku: String(sku),
    },
    "Variant update failed"
  );

  ensureNoUserErrors(data?.productVariantsBulkUpdate, "Variant user error");

  return data?.productVariantsBulkUpdate?.productVariants?.[0] || null;
};

const attachProductImage = async (productId, image) => {
  if (!image) {
    return;
  }

  const data = await runShopifyQuery(
    GQL_CREATE_MEDIA,
    {
      productId,
      media: [
        {
          originalSource: image,
          mediaContentType: "IMAGE",
        },
      ],
    },
    "Media error"
  );

  const mediaErrors = data?.productCreateMedia?.mediaUserErrors || [];
  if (mediaErrors.length) {
    throw createStepError({ message: "Media user error", userErrors: mediaErrors, statusCode: 400 });
  }
};

const waitForVariantToBeReady = async (variantId) => {
  for (let i = 0; i < WAIT_RETRIES; i += 1) {
    const data = await runShopifyQuery(
      GQL_CHECK_VARIANT,
      { id: variantId },
      "Variant fetch failed"
    );

    const variant = data?.node;
    if (variant?.id === variantId && variant.availableForSale) {
      return variant;
    }

    await sleep(WAIT_INTERVAL_MS);
  }

  throw createStepError({
    message: "Variant was created but did not become available for sale in time",
    statusCode: 502,
  });
};

const createDiamondProduct = async ({ diamond, sku, price }) => {
  const title = buildDiamondTitle(diamond, sku);

  const productId = await createProduct(title, sku);
  await publishProduct(productId);
  const { product, variant } = await getProductAndVariant(productId);

  const updatedVariant = await updateVariant({
    productId,
    variantId: variant.id,
    price,
    sku,
  });

  await attachProductImage(productId, diamond.image);

  const readyVariant = await waitForVariantToBeReady(variant.id);

  return formatVariantResponse({
    variant: {
      ...variant,
      ...updatedVariant,
      ...readyVariant,
    },
    product,
  });
};

// API handler
const createDiamondAndReturnVariant = async (req, res) => {
  try {
    const { diamond } = req.body;

    if (!diamond || diamond.id === undefined || diamond.id === null || diamond.price === undefined || diamond.price === null) {
      return res.status(400).json({
        success: false,
        message: "diamond.id and diamond.price are required",
      });
    }

    const sku = String(diamond.id);
    const price = Number(diamond.price);

    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({
        success: false,
        message: "diamond.price must be a valid non-negative number",
      });
    }

    const existingVariant = await findVariantBySKU(sku);

    if (existingVariant) {
      return res.json(
        formatVariantResponse({
          variant: existingVariant,
          product: existingVariant.product,
        })
      );
    }

    const result = await createDiamondProduct({ diamond, sku, price });

    return res.json(result);
  } catch (error) {
    const responseStatus = error.response?.status;
    const responseData = error.response?.data;

    return res.status(error.statusCode || responseStatus || 500).json({
      success: false,
      message: responseData?.errors?.[0]?.message || error.message,
      graphqlErrors: error.graphqlErrors || responseData?.errors,
      userErrors: error.userErrors,
      upstreamStatus: responseStatus,
    });
  }
};

module.exports = { createDiamondAndReturnVariant };
