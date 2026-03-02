const axios = require("axios");

const getSettings = async (req, res) => {
    try {
        const { minPrice, maxPrice, shape, metal } = req.query;

        const response = await axios.get(
            `https://${process.env.SHOPIFY_STORE}/admin/api/${process.env.SHOPIFY_API_VERSION}/products.json?limit=250`,
            {
                headers: {
                    "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
                },
            }
        );

        let products = response.data.products;

        let formatted = products.map((p) => {
            const variant = p.variants[0];

            return {
                id: p.id,
                title: p.title,
                image: p.images[0]?.src || "",
                price: Number(variant?.price || 0),
                sku: variant?.sku || "",
                tags: p.tags.split(",").map(t => t.trim().toLowerCase()),
                shopify_variant_id: variant?.id,
            };
        });

        // 🔹 PRICE FILTER
        if (minPrice) {
            formatted = formatted.filter(p => p.price >= Number(minPrice));
        }

        if (maxPrice) {
            formatted = formatted.filter(p => p.price <= Number(maxPrice));
        }

        // 🔹 SHAPE FILTER
        if (shape) {
            formatted = formatted.filter(p =>
                p.tags.includes(`shape_${shape.toLowerCase()}`)
            );
        }

        // 🔹 METAL FILTER
        if (metal) {
            formatted = formatted.filter(p =>
                p.tags.includes(`metal_${metal.toLowerCase()}`)
            );
        }

        res.json(formatted);

    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(500).json({ message: "Failed to fetch products" });
    }
};

const getSettingById = async (req, res) => {
    try {
        const response = await axios.get(
            `https://${process.env.SHOPIFY_STORE}/admin/api/${process.env.SHOPIFY_API_VERSION}/products/${req.params.id}.json`,
            {
                headers: {
                    "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
                },
            }
        );

        const p = response.data.product;

        const formatted = {
            id: p.id,
            title: p.title,
            display_name: p.title,
            image: p.images[0]?.src || "",
            price: p.variants[0]?.price || 0,
            currency_symbol: "$",
            sku: p.variants[0]?.sku || "",
            shopify_product_id: p.id,
            shopify_variant_id: p.variants[0]?.id,
        };

        res.json(formatted);
    } catch (error) {
        res.status(404).json({ message: "Setting not found" });
    }
};

module.exports = { getSettings, getSettingById };