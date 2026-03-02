const { readData } = require("../Utils/readWriteJson");

const getDiamond = (req, res) => {
    const data = readData();
    res.json(data.diamonds);
};

const getDiamondById = (req, res) => {
    const data = readData();
    const diamond = data.diamonds.find(d => d.id == req.params.id);
    if (!diamond) {
        return res.status(404).json({ message: "diamond not found" });
    }
    res.json(diamond);
};

const getFilteredDiamond = (req, res) => {
    const filter = req.body;
    const data = readData().diamonds;

    const filtered = data.filter(d => {
        return (
            (!filter.shape || d.shape === filter.shape) &&
            (!filter.cut || filter.cut.includes(d.cut)) &&
            (!filter.clarity || filter.clarity.includes(d.clarity)) &&
            (!filter.color || filter.color.includes(d.color)) &&
            (!filter.minCarat || d.carat >= filter.minCarat) &&
            (!filter.maxCarat || d.carat <= filter.maxCarat) &&
            (!filter.minPrice || d.price >= filter.minPrice) &&
            (!filter.maxPrice || d.price <= filter.maxPrice)
        );
    });
    res.json(filtered);
};
module.exports = { getDiamond, getDiamondById, getFilteredDiamond };