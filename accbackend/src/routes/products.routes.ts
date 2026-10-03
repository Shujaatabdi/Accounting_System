import { Router } from "express";
import {
  createCategoryController,
  createProductController,
  createUnitController,
  getProductController,
  listCategoriesController,
  listProductsController,
  listUnitsController,
  updateCategoryController,
  listProductSuppliersController,
  saveProductSuppliersController,
  updateProductController,
} from "../controllers/products.controller";
import { requirePermission } from "../middleware/authorize";

export const productsRouter = Router();
productsRouter.get("/products", requirePermission("products.view"), listProductsController);
productsRouter.post("/products", requirePermission("products.create"), createProductController);
productsRouter.get("/product-categories", requirePermission("products.view"), listCategoriesController);
productsRouter.post("/product-categories", requirePermission("products.create"), createCategoryController);
productsRouter.put("/product-categories/:id", requirePermission("products.update"), updateCategoryController);
productsRouter.get("/units", requirePermission("products.view"), listUnitsController);
productsRouter.post("/units", requirePermission("products.create"), createUnitController);
productsRouter.get("/products/:id", requirePermission("products.view"), getProductController);
productsRouter.put("/products/:id", requirePermission("products.update"), updateProductController);
productsRouter.get("/products/:id/suppliers", requirePermission("products.view"), listProductSuppliersController);
productsRouter.put("/products/:id/suppliers", requirePermission("products.update"), saveProductSuppliersController);
