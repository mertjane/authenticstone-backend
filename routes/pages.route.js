import express from 'express';
import axios from 'axios';
const router = express.Router();


router.get('/:slug', async (req, res) => {
  try {
    const { data } = await axios.get(`${process.env.WORDPRESS_API}/pages?slug=${req.params.slug}`);
    res.json(data[0] || { error: 'Not found' });
  } catch { res.status(500).send('Server error'); }
});

export default router;

