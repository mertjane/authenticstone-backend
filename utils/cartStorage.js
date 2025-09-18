// In-memory cart storage per session
const sessionCarts = new Map();

export const getSessionCart = (sessionId) => {
  if (!sessionCarts.has(sessionId)) {
    sessionCarts.set(sessionId, []);
  }
  return sessionCarts.get(sessionId);
};

export const setSessionCart = (sessionId, cartItems) => {
  sessionCarts.set(sessionId, cartItems);
};

export const addItemToSessionCart = (sessionId, item) => {
  const cart = getSessionCart(sessionId);
  
  // Generate unique ID for new items
  const newItem = {
    ...item,
    id: Date.now() + Math.random(), // Generate unique ID
    timestamp: Date.now()
  };
  
  // Simply add the item - duplicate checking is handled in the route
  cart.push(newItem);
  
  setSessionCart(sessionId, cart);
  return cart;
};

export const updateItemInSessionCart = (sessionId, itemId, updates) => {
  const cart = getSessionCart(sessionId);
  const index = cart.findIndex(item => item.id === itemId);
  
  if (index >= 0) {
    cart[index] = { ...cart[index], ...updates };
    setSessionCart(sessionId, cart);
  }
  
  return cart;
};

export const removeItemFromSessionCart = (sessionId, itemId) => {
  const cart = getSessionCart(sessionId);
  const filteredCart = cart.filter(item => item.id !== itemId);
  setSessionCart(sessionId, filteredCart);
  return filteredCart;
};

export const clearSessionCart = (sessionId) => {
  sessionCarts.delete(sessionId);
};