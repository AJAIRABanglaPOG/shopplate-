import type {
  Cart,
  CartItem,
  Collection,
  CustomerInput,
  Image,
  Menu,
  Page,
  PageInfo,
  Product,
  User,
} from "./types";

// WordPress/WooCommerce configuration
const WORDPRESS_API_URL = import.meta.env.PUBLIC_WORDPRESS_API_URL || 'http://localhost/wp-json';
const WOOCOMMERCE_CONSUMER_KEY = import.meta.env.PUBLIC_WOOCOMMERCE_CONSUMER_KEY;
const WOOCOMMERCE_CONSUMER_SECRET = import.meta.env.PUBLIC_WOOCOMMERCE_CONSUMER_SECRET;

if (!WORDPRESS_API_URL) {
  throw new Error(
    'PUBLIC_WORDPRESS_API_URL is not configured. Please set it to your WordPress site URL (e.g., "https://yoursite.com/wp-json") in your .env file.'
  );
}

// WordPress REST API fetch wrapper
export async function wordpressFetch<T>({
  endpoint,
  method = 'GET',
  body,
  requireAuth = false,
}: {
  endpoint: string;
  method?: string;
  body?: any;
  requireAuth?: boolean;
}): Promise<T> {
  const url = new URL(endpoint, WORDPRESS_API_URL);
  
  // Add WooCommerce authentication for protected endpoints
  if (requireAuth && WOOCOMMERCE_CONSUMER_KEY && WOOCOMMERCE_CONSUMER_SECRET) {
    url.searchParams.append('consumer_key', WOOCOMMERCE_CONSUMER_KEY);
    url.searchParams.append('consumer_secret', WOOCOMMERCE_CONSUMER_SECRET);
  }

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  const config: RequestInit = {
    method,
    headers,
  };

  if (body && method !== 'GET') {
    config.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url.toString(), config);
    
    if (!response.ok) {
      throw new Error(`WordPress API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('WordPress API fetch error:', error);
    throw error;
  }
}

// Cart functions
export async function createCart(): Promise<Cart> {
  // WooCommerce doesn't require explicit cart creation - it's session-based
  return getCart();
}

export async function getCart(): Promise<Cart> {
  try {
    const cart = await wordpressFetch<Cart>({
      endpoint: '/wc/store/v1/cart',
    });
    return cart;
  } catch (error) {
    // Return empty cart if none exists
    return {
      items: [],
      totals: {
        total_items: '0',
        total_items_tax: '0',
        total_fees: '0',
        total_fees_tax: '0',
        total_discount: '0',
        total_discount_tax: '0',
        total_shipping: '0',
        total_shipping_tax: '0',
        total_price: '0',
        total_tax: '0',
        currency_code: 'USD',
        currency_symbol: '$',
      },
      item_count: 0,
      needs_payment: false,
      needs_shipping: false,
    };
  }
}

export async function addToCart(
  productId: number,
  quantity: number = 1,
  variation?: any
): Promise<Cart> {
  const body: any = {
    id: productId,
    quantity,
  };

  if (variation) {
    body.variation = variation;
  }

  await wordpressFetch({
    endpoint: '/wc/store/v1/cart/add-item',
    method: 'POST',
    body,
  });

  return getCart();
}

export async function removeFromCart(itemKey: string): Promise<Cart> {
  await wordpressFetch({
    endpoint: `/wc/store/v1/cart/remove-item`,
    method: 'POST',
    body: { key: itemKey },
  });

  return getCart();
}

export async function updateCart(
  itemKey: string,
  quantity: number
): Promise<Cart> {
  await wordpressFetch({
    endpoint: '/wc/store/v1/cart/update-item',
    method: 'POST',
    body: { key: itemKey, quantity },
  });

  return getCart();
}

// Product functions
export async function getProducts({
  page = 1,
  per_page = 12,
  search,
  category,
  tag,
  orderby = 'date',
  order = 'desc',
  min_price,
  max_price,
}: {
  page?: number;
  per_page?: number;
  search?: string;
  category?: string;
  tag?: string;
  orderby?: string;
  order?: string;
  min_price?: string;
  max_price?: string;
} = {}): Promise<{ products: Product[]; pageInfo: PageInfo }> {
  const params = new URLSearchParams({
    page: page.toString(),
    per_page: per_page.toString(),
    orderby,
    order,
  });

  if (search) params.append('search', search);
  if (category) params.append('category', category);
  if (tag) params.append('tag', tag);
  if (min_price) params.append('min_price', min_price);
  if (max_price) params.append('max_price', max_price);

  const response = await fetch(`${WORDPRESS_API_URL}/wc/v3/products?${params.toString()}`, {
    headers: {
      'Authorization': `Basic ${btoa(`${WOOCOMMERCE_CONSUMER_KEY}:${WOOCOMMERCE_CONSUMER_SECRET}`)}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch products: ${response.statusText}`);
  }

  const products = await response.json();
  const totalPages = parseInt(response.headers.get('X-WP-TotalPages') || '1');
  const total = parseInt(response.headers.get('X-WP-Total') || '0');

  return {
    products,
    pageInfo: {
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
      endCursor: page.toString(),
    },
  };
}

export async function getProduct(slug: string): Promise<Product | undefined> {
  try {
    const products = await wordpressFetch<Product[]>({
      endpoint: `/wc/v3/products?slug=${slug}`,
      requireAuth: true,
    });

    return products[0];
  } catch (error) {
    console.error('Error fetching product:', error);
    return undefined;
  }
}

export async function getProductRecommendations(productId: number): Promise<Product[]> {
  try {
    const product = await wordpressFetch<Product>({
      endpoint: `/wc/v3/products/${productId}`,
      requireAuth: true,
    });

    // Get related products or products from same categories
    if (product.related_ids && product.related_ids.length > 0) {
      const relatedProducts = await Promise.all(
        product.related_ids.slice(0, 4).map(id =>
          wordpressFetch<Product>({
            endpoint: `/wc/v3/products/${id}`,
            requireAuth: true,
          })
        )
      );
      return relatedProducts;
    }

    // Fallback to products from same category
    if (product.categories && product.categories.length > 0) {
      const categoryProducts = await wordpressFetch<Product[]>({
        endpoint: `/wc/v3/products?category=${product.categories[0].id}&exclude=${productId}&per_page=4`,
        requireAuth: true,
      });
      return categoryProducts;
    }

    return [];
  } catch (error) {
    console.error('Error fetching product recommendations:', error);
    return [];
  }
}

// Collection/Category functions
export async function getCollections(): Promise<Collection[]> {
  try {
    const categories = await wordpressFetch<any[]>({
      endpoint: '/wc/v3/products/categories?per_page=100',
      requireAuth: true,
    });

    return categories.map(category => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      image: category.image ? {
        id: category.image.id,
        src: category.image.src,
        name: category.image.name,
        alt: category.image.alt,
      } : null,
      count: category.count,
      path: `/products?category=${category.slug}`,
    }));
  } catch (error) {
    console.error('Error fetching collections:', error);
    return [];
  }
}

export async function getCollectionProducts({
  collection,
  reverse,
  sortKey,
}: {
  collection: string;
  reverse?: boolean;
  sortKey?: string;
}): Promise<{ pageInfo: PageInfo | null; products: Product[] }> {
  try {
    const order = reverse ? 'asc' : 'desc';
    let orderby = 'date';
    
    switch (sortKey) {
      case 'PRICE':
        orderby = 'price';
        break;
      case 'BEST_SELLING':
        orderby = 'popularity';
        break;
      case 'CREATED_AT':
        orderby = 'date';
        break;
      default:
        orderby = 'date';
    }

    const result = await getProducts({
      category: collection,
      orderby,
      order,
      per_page: 100,
    });

    return result;
  } catch (error) {
    console.error('Error fetching collection products:', error);
    return { pageInfo: null, products: [] };
  }
}

// User/Customer functions
export async function createCustomer(input: CustomerInput): Promise<any> {
  try {
    const customer = await wordpressFetch({
      endpoint: '/wc/v3/customers',
      method: 'POST',
      body: {
        email: input.email,
        first_name: input.first_name,
        last_name: input.last_name,
        username: input.email,
        password: input.password,
      },
      requireAuth: true,
    });

    return { customer, customerCreateErrors: [] };
  } catch (error: any) {
    return {
      customer: null,
      customerCreateErrors: [{ code: 'CREATION_FAILED', message: error.message }],
    };
  }
}

export async function getCustomerAccessToken({
  email,
  password,
}: Partial<CustomerInput>): Promise<any> {
  try {
    // WordPress doesn't use access tokens like Shopify
    // Instead, we'll use JWT or session-based authentication
    const response = await wordpressFetch({
      endpoint: '/wp/v2/users/me',
      method: 'POST',
      body: { username: email, password },
    });

    return { token: 'wordpress-session-token', customerLoginErrors: [] };
  } catch (error: any) {
    return {
      token: null,
      customerLoginErrors: [{ code: 'INVALID_CREDENTIALS', message: error.message }],
    };
  }
}

export async function getUserDetails(accessToken: string): Promise<{ customer: User }> {
  try {
    const user = await wordpressFetch<User>({
      endpoint: '/wp/v2/users/me',
    });

    return { customer: user };
  } catch (error) {
    throw new Error('Failed to fetch user details');
  }
}

// Utility functions
export async function getHighestProductPrice(): Promise<{
  amount: string;
  currencyCode: string;
} | null> {
  try {
    const products = await getProducts({
      orderby: 'price',
      order: 'desc',
      per_page: 1,
    });

    if (products.products.length > 0) {
      const highestProduct = products.products[0];
      return {
        amount: highestProduct.price,
        currencyCode: 'USD', // You might want to get this from WooCommerce settings
      };
    }

    return null;
  } catch (error) {
    console.error('Error fetching highest product price:', error);
    return null;
  }
}

export async function getVendors(): Promise<{ vendor: string; productCount: number }[] > {
  // WordPress doesn't have built-in vendors, but you could use a plugin
  // For now, we'll return an empty array
  return [];
}

export async function getMenu(handle: string): Promise<Menu[]> {
  try {
    const menus = await wordpressFetch<any[]>({
      endpoint: `/wp/v2/menus/${handle}`,
    });

    return menus.map(item => ({
      title: item.title,
      path: item.url,
    }));
  } catch (error) {
    console.error('Error fetching menu:', error);
    return [];
  }
}

export async function getPages(): Promise<Page[]> {
  try {
    return await wordpressFetch<Page[]>({
      endpoint: '/wp/v2/pages?per_page=100',
    });
  } catch (error) {
    console.error('Error fetching pages:', error);
    return [];
  }
}

export async function getPage(slug: string): Promise<Page | undefined> {
  try {
    const pages = await wordpressFetch<Page[]>({
      endpoint: `/wp/v2/pages?slug=${slug}`,
    });

    return pages[0];
  } catch (error) {
    console.error('Error fetching page:', error);
    return undefined;
  }
}