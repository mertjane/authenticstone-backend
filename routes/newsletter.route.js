import express from 'express';
import axios from 'axios';

const router = express.Router();

// Subscribe to newsletter
router.post('/subscribe', async (req, res) => {
  try {
    const { email, firstName, lastName } = req.body;

    // Validate email
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    const MAILCHIMP_API_KEY = process.env.MAILCHIMP_API_KEY;
    const MAILCHIMP_AUDIENCE_ID = process.env.MAILCHIMP_AUDIENCE_ID;
    const MAILCHIMP_SERVER_PREFIX = MAILCHIMP_API_KEY.split('-')[1];

    console.log('📧 Attempting Mailchimp subscription...');
    console.log('Server:', MAILCHIMP_SERVER_PREFIX);
    console.log('Audience ID:', MAILCHIMP_AUDIENCE_ID);
    console.log('Email:', email);

    // Subscribe to Mailchimp
    const response = await axios.post(
      `https://${MAILCHIMP_SERVER_PREFIX}.api.mailchimp.com/3.0/lists/${MAILCHIMP_AUDIENCE_ID}/members`,
      {
        email_address: email,
        status: 'subscribed',
        merge_fields: {
          FNAME: firstName || '',
          LNAME: lastName || ''
        }
      },
      {
        headers: {
          Authorization: `Bearer ${MAILCHIMP_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Mailchimp subscription successful:', email);

    res.json({
      success: true,
      message: 'Successfully subscribed to newsletter!',
      data: {
        email: response.data.email_address,
        status: response.data.status
      }
    });

  } catch (error) {
    console.error('❌ Newsletter subscription error:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });

    // Handle duplicate subscriber
    if (error.response?.data?.title === 'Member Exists') {
      return res.status(400).json({
        success: false,
        message: 'This email is already subscribed'
      });
    }

    // Handle invalid email
    if (error.response?.data?.title === 'Invalid Resource') {
      return res.status(400).json({
        success: false,
        message: 'Invalid email address'
      });
    }

    // Handle forbidden/authentication errors
    if (error.response?.status === 401 || error.response?.status === 403) {
      return res.status(500).json({
        success: false,
        message: 'API authentication failed. Please contact support.'
      });
    }

    res.status(500).json({
      success: false,
      message: error.response?.data?.detail || 'Failed to subscribe. Please try again later.'
    });
  }
});

// Test endpoint
router.get('/test', async (req, res) => {
  try {
    const MAILCHIMP_API_KEY = process.env.MAILCHIMP_API_KEY;
    const MAILCHIMP_AUDIENCE_ID = process.env.MAILCHIMP_AUDIENCE_ID;
    const MAILCHIMP_SERVER_PREFIX = MAILCHIMP_API_KEY.split('-')[1];

    const response = await axios.get(
      `https://${MAILCHIMP_SERVER_PREFIX}.api.mailchimp.com/3.0/lists/${MAILCHIMP_AUDIENCE_ID}`,
      {
        headers: {
          Authorization: `Bearer ${MAILCHIMP_API_KEY}`
        }
      }
    );

    res.json({
      success: true,
      message: 'Mailchimp configuration is correct!',
      audience: {
        id: response.data.id,
        name: response.data.name,
        member_count: response.data.stats.member_count
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});

export default router;