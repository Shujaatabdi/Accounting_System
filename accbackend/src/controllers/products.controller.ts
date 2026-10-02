import { actorFrom } from "../middleware/authenticate";
import { createCategory, createProduct, createUnit, getCategories, getProduct, getUnits, listProducts, updateCategoryProfile, updateProductProfile } from "../modules/products/products.service";
import { categoryBody, productBody, productListQuery, unitBody } from "../modules/products/products.schemas";
import { parseBody, parseQuery, wrap } from "../shared/http";
import { toPage } from "../shared/http/pagination";

export const listProductsController = wrap(async (req, res) => {
  const queryInput = parseQuery(productListQuery, req.query);
  res.json(await listProducts(toPage(queryInput), queryInput));
});

export const createProductController = wrap(async (req, res) => {
  res.status(201).json(await createProduct(parseBody(productBody, req.body), actorFrom(req)));
});

export const getProductController = wrap(async (req, res) => {
  res.json(await getProduct(req.params.id));
});

export const updateProductController = wrap(async (req, res) => {
  res.json(await updateProductProfile(req.params.id, parseBody(productBody, req.body), actorFrom(req)));
});

export const listCategoriesController = wrap(async (_req, res) => {
  res.json({ data: await getCategories() });
});

export const createCategoryController = wrap(async (req, res) => {
  res.status(201).json(await createCategory(parseBody(categoryBody, req.body), actorFrom(req)));
});

export const updateCategoryController = wrap(async (req, res) => {
  res.json(await updateCategoryProfile(req.params.id, parseBody(categoryBody, req.body), actorFrom(req)));
});

export const listUnitsController = wrap(async (_req, res) => {
  res.json({ data: await getUnits() });
});

export const createUnitController = wrap(async (req, res) => {
  res.status(201).json(await createUnit(parseBody(unitBody, req.body), actorFrom(req)));
});
