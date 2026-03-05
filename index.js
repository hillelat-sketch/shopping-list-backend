require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// CORS configuration
app.use(cors());
app.use(express.json());

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const PORT = process.env.PORT || 3000;

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ============ USERS ============

// Initialize user (create if not exists)
app.post('/api/users/init', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    // Check if user exists
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();

    if (!existing) {
      // Create user
      await supabase
        .from('users')
        .insert([{ id: userId }]);

      // Create default categories
      const defaultCategories = [
        { name: 'קפואים', order_index: 0 },
        { name: 'חלבי', order_index: 1 },
        { name: 'שימורים', order_index: 2 },
        { name: 'יבשים', order_index: 3 },
        { name: 'חטיפים', order_index: 4 },
        { name: 'משקאות', order_index: 5 },
        { name: 'אחר', order_index: 6 }
      ];

      for (const cat of defaultCategories) {
        await supabase
          .from('categories')
          .insert([{ user_id: userId, ...cat }]);
      }

      // Create default list
      await supabase
      .from('shopping_lists')
      .insert([{ user_id: userId, is_active: true }]);

    }

    res.json({ success: true, userId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ SHOPPING LIST ============

// Get active shopping list
app.get('/api/lists/active/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const { data: list, error } = await supabase
      .from('shopping_lists')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (error) throw error;
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ LIST ITEMS ============

// Get all items in list
app.get('/api/items/:listId', async (req, res) => {
  try {
    const { listId } = req.params;

    const { data: items, error } = await supabase
      .from('list_items')
      .select(`
        *,
        category:categories(id, name)
      `)
      .eq('list_id', listId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json(items || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add item to list
app.post('/api/items', async (req, res) => {
  try {
    const { list_id, name, quantity, unit, category_id, created_by } = req.body;

    if (!list_id || !name || !created_by) {
      return res.status(400).json({ error: 'list_id, name, and created_by required' });
    }

    const { data: item, error } = await supabase
      .from('list_items')
      .insert([{
        list_id,
        name,
        quantity: quantity || 1,
        unit: unit || '',
        category_id: category_id || null,
        created_by
      }])
      .select();

    if (error) throw error;
    res.json(item[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update item
app.put('/api/items/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;
    const updates = req.body;

    const { data: item, error } = await supabase
      .from('list_items')
      .update(updates)
      .eq('id', itemId)
      .select();

    if (error) throw error;
    res.json(item[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete item
app.delete('/api/items/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;

    const { error } = await supabase
      .from('list_items')
      .delete()
      .eq('id', itemId);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ CATEGORIES ============

// Get user categories
app.get('/api/categories/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const { data: categories, error } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', userId)
      .order('order_index', { ascending: true });

    if (error) throw error;
    res.json(categories || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add category
app.post('/api/categories', async (req, res) => {
  try {
    const { user_id, name } = req.body;

    if (!user_id || !name) {
      return res.status(400).json({ error: 'user_id and name required' });
    }

    const { data: category, error } = await supabase
      .from('categories')
      .insert([{ user_id, name, order_index: 0 }])
      .select();

    if (error) throw error;
    res.json(category[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ SHOPPING HISTORY ============

// Save shopping history (when user completes a shop)
app.post('/api/history', async (req, res) => {
  try {
    const { user_id, items, total_items, list_id } = req.body;

    if (!user_id || !items) {
      return res.status(400).json({ error: 'user_id and items required' });
    }

    // Save history
    const { data: history, error: historyError } = await supabase
      .from('shopping_history')
      .insert([{
        user_id,
        items: items,
        total_items: total_items || items.length
      }])
      .select();

    if (historyError) throw historyError;

    // Clear the list
    if (list_id) {
      await supabase
        .from('list_items')
        .delete()
        .eq('list_id', list_id);
    }

    res.json(history[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get shopping history
app.get('/api/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const { data: history, error } = await supabase
      .from('shopping_history')
      .select('*')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false })
      .limit(10);

    if (error) throw error;
    res.json(history || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ SERVER ============

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
