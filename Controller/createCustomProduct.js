const axios = require("axios");

const shopify = axios.create({
  baseURL: `https://${process.env.SHOPIFY_STORE}/admin/api/${process.env.SHOPIFY_API_VERSION}/graphql.json`,
  headers: {
    "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
    "Content-Type": "application/json",
  },
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getGraphqlErrors = (response) => response?.data?.errors || null;

const createStepError = ({ message, statusCode = 500, graphqlErrors, userErrors }) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.graphqlErrors = graphqlErrors;
  error.userErrors = userErrors;
  return error;
};

const ensureNoGraphqlErrors = (response, message) => {
  const graphqlErrors = getGraphqlErrors(response);
  if (graphqlErrors) {
    throw createStepError({ message, graphqlErrors });
  }
};

const ensureNoUserErrors = (payload, message) => {
  const userErrors = payload?.userErrors || [];
  if (userErrors.length) {
    throw createStepError({ message, userErrors, statusCode: 400 });
  }
};

const ensureValue = (value, message, extra = {}) => {
  if (value === undefined || value === null) {
    throw createStepError({ message, ...extra });
  }
  return value;
};

const findVariantBySKU = async (sku) => {
  const query = `
    query getProductBySKU($query: String!) {
      productVariants(first: 1, query: $query) {
        nodes {
          id
          sku
          product {
            id
            handle
          }
        }
      }
    }
  `;

  const res = await shopify.post("", {
    query,
    variables: { query: `sku:${sku}` },
  });

  ensureNoGraphqlErrors(res, "SKU lookup failed");

  const node = res?.data?.data?.productVariants?.nodes?.[0];
  return node || null;
};

const waitForVariant = async (variantId) => {
  const query = `
    query getVariant($id: ID!) {
      node(id: $id) {
        ... on ProductVariant {
          id
          availableForSale
        }
      }
    }
  `;

  for (let i = 0; i < 15; i++) {
    const res = await shopify.post("", {
      query,
      variables: { id: variantId },
    });

    ensureNoGraphqlErrors(res, "Variant fetch failed");

    const node = res.data.data.node;

    if (node?.id === variantId && node.availableForSale) {
      return true;
    }

    await sleep(1500);
  }

  return false;
};

const createDiamondProduct = async ({ title, price, sku, image }) => {
  const createProductMutation = `
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

  const createRes = await shopify.post("", {
    query: createProductMutation,
    variables: {
      product: {
        title,
        vendor: "Custom Diamonds",
        productType: "Diamond",
        tags: ["diamond", `sku:${sku}`],
        status: "ACTIVE",
      },
    },
  });

  ensureNoGraphqlErrors(createRes, "Product create failed");

  const productData = createRes.data.data.productCreate;
  ensureNoUserErrors(productData, "Product user error");

  const productId = ensureValue(productData?.product?.id, "Product was created without an id");

  const variantQuery = `
    query GetVariant($productId: ID!) {
      product(id: $productId) {
        variants(first: 1) {
          nodes {
            id
            inventoryItem {
              id
            }
          }
        }
      }
    }
  `;

  const variantRes = await shopify.post("", {
    query: variantQuery,
    variables: { productId },
  });

  ensureNoGraphqlErrors(variantRes, "Variant fetch failed");

  const variantNode = variantRes?.data?.data?.product?.variants?.nodes?.[0];
  const variantId = ensureValue(
    variantNode?.id,
    "Product variant was not available after product creation"
  );
  const inventoryItemId = ensureValue(
    variantNode?.inventoryItem?.id,
    "Variant inventory item was not available after product creation"
  );

  const updateMutation = `
    mutation UpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants {
          id
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
          id: variantId,
          price: String(price),
          inventoryPolicy: "CONTINUE",
        },
      ],
    },
  });

  ensureNoGraphqlErrors(updateRes, "Variant update failed");

  ensureNoUserErrors(updateRes.data.data.productVariantsBulkUpdate, "Variant user error");

  const inventoryItemUpdateMutation = `
    mutation UpdateInventoryItem($id: ID!, $input: InventoryItemInput!) {
      inventoryItemUpdate(id: $id, input: $input) {
        inventoryItem {
          id
          sku
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const inventoryItemRes = await shopify.post("", {
    query: inventoryItemUpdateMutation,
    variables: {
      id: inventoryItemId,
      input: {
        sku: String(sku),
      },
    },
  });

  ensureNoGraphqlErrors(inventoryItemRes, "Inventory item update failed");
  ensureNoUserErrors(inventoryItemRes?.data?.data?.inventoryItemUpdate, "Inventory item user error");

  if (image) {
    const mediaMutation = `
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

    ensureNoGraphqlErrors(mediaRes, "Media error");

    const mediaErrors = mediaRes?.data?.data?.productCreateMedia?.mediaUserErrors || [];
    if (mediaErrors.length) {
      throw createStepError({ message: "Media user error", userErrors: mediaErrors });
    }
  }

  const variantReady = await waitForVariant(variantId);
  if (!variantReady) {
    throw createStepError({
      message: "Variant was created but did not become available for sale in time",
      statusCode: 502,
    });
  }

  return { productId, variantId };
};

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

    const existing = await findVariantBySKU(sku);

    if (existing) {
      return res.json({
        success: true,
        variantId: existing.id,
        productId: existing.product.id,
        handle: existing.product.handle,
      });
    }

    const titleParts = [diamond.carat, diamond.shape, diamond.color, diamond.clarity]
      .filter((value) => value !== undefined && value !== null && String(value).trim() !== "")
      .map((value, index) => (index === 0 ? `${value}CT` : String(value).trim()));
    const title = titleParts.join(" ") || `Diamond ${sku}`;

    const created = await createDiamondProduct({
      title,
      price,
      sku,
      image: diamond.image,
    });

    return res.json({
      success: true,
      variantId: created.variantId,
      productId: created.productId,
    });
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
