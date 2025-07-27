import Cookies from "js-cookie";
import {
  addToCart,
  getCart,
  removeFromCart,
  updateCart,
} from "@/lib/wordpress";

export async function addItem(productId: number, quantity: number = 1) {
  if (!productId) {
    return "Missing product ID";
  }

  try {
    await addToCart(productId, quantity);
  } catch (e) {
    return "Error adding item to cart";
  }
}

export async function removeItem(itemKey: string) {
  if (!itemKey) {
    return "Missing item key";
  }

  try {
    await removeFromCart(itemKey);
  } catch (e) {
    return "Error removing item from cart";
  }
}

export async function updateItemQuantity(payload: {
  itemKey: string;
  quantity: number;
}) {
  const { itemKey, quantity } = payload;

  try {
    if (quantity === 0) {
      await removeFromCart(itemKey);
      return;
    }

    await updateCart(itemKey, quantity);
  } catch (e) {
    return "Error updating item quantity";
  }
}
