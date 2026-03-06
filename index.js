require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.post('/api/users/init', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const { data: existing } = await supabase.from('users').select('id').eq('id', userId).maybeSingle();

    if (!existing) {
      const { error: userErr } = await supabase.from('users').insert([{ id: userId }]);
      if (userErr) throw userErr;

      const cats = ['קפואים','חלבי','שימורים','יבשים','חטיפים','משקאות','אחר'];
      for (let i = 0; i < cats.length; i++) {
        await supabase.from('categories').insert([{ user_id: userId, name: cats[i], order_index: i }]);
      }
    }

    // Find existing list or create new one
    let { data: list } = await supabase
      .from('shopping_lists')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!list) {
      const { data: newList, error: listErr } = await supabase
        .from('shopping_lists')
        .insert([{ user_id: userId, name: 'רשימת קניות', is_active: true }])
        .select('id')
        .single();
      if (listErr) throw listErr;
      list = newList;
    }

    res.json({ success: true, userId, listId: list.id });
  } catch (error) {
    console.error('init error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/lists/active/:userId', async (req, res) => {
  try {
    const { data: list } = await supabase.from('shopping_lists').select('*').eq('user_id', req.params.userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!list) return res.status(404).json({ error: 'No list found' });
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/items/:listId', async (req, res) => {
  try {
    const { data, error } = await supabase.from('list_items').select('*, category:categories(id, name)').eq('list_id', req.params.listId).order('created_at', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/items', async (req, res) => {
  try {
    const { list_id, name, quantity, unit, category_id, created_by } = req.body;
    if (!list_id || !name || !created_by) return res.status(400).json({ error: 'list_id, name, created_by required' });
    const { data, error } = await supabase.from('list_items').insert([{ list_id, name, quantity: quantity || 1, unit: unit || '', category_id: category_id || null, created_by }]).select();
    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/items/:itemId', async (req, res) => {
  try {
    const { data, error } = await supabase.from('list_items').update(req.body).eq('id', req.params.itemId).select();
    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/items/:itemId', async (req, res) => {
  try {
    const { error } = await supabase.from('list_items').delete().eq('id', req.params.itemId);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/categories/:userId', async (req, res) => {
  try {
    const { data, error } = await supabase.from('categories').select('*').eq('user_id', req.params.userId).order('order_index', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
