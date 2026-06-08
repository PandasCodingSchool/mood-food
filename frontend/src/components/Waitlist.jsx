import { useState } from 'react';
import { Mail, User, MapPin, Utensils, CheckCircle, Loader2 } from 'lucide-react';
import { trackEvent } from '../utils/analytics';

function Waitlist() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    city: '',
    cuisine: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    trackEvent('waitlist_join_attempted', formData);

    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        trackEvent('waitlist_joined', formData);
        setIsSubmitted(true);
      } else {
        throw new Error('Failed to join waitlist');
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
      trackEvent('waitlist_error', { error: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  if (isSubmitted) {
    return (
      <section id="waitlist" className="py-20 bg-gradient-to-br from-primary-600 to-secondary-600">
        <div className="section-container">
          <div className="max-w-xl mx-auto text-center text-white">
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-3xl font-bold mb-4">
              You are on the list!
            </h2>
            <p className="text-white/80 text-lg">
              Thanks for joining our waitlist. We will notify you as soon as we launch in your city.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="waitlist" className="py-20 bg-gradient-to-br from-primary-600 to-secondary-600">
      <div className="section-container">
        <div className="max-w-2xl mx-auto">
          <div className="text-center text-white mb-10">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Join the Waitlist
            </h2>
            <p className="text-white/80 text-lg">
              Be the first to know when we launch in your city. Get early access and exclusive perks.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-3xl p-8 md:p-10 shadow-2xl"
          >
            {error && (
              <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl text-sm">
                {error}
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-6 mb-6">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <User className="w-4 h-4 inline mr-2" />
                  Name *
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
                  placeholder="Your name"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Mail className="w-4 h-4 inline mr-2" />
                  Email *
                </label>
                <input
                  type="email"
                  name="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
                  placeholder="you@example.com"
                />
              </div>

              {/* City */}
              {/* <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <MapPin className="w-4 h-4 inline mr-2" />
                  City *
                </label>
                <input
                  type="text"
                  name="city"
                  required
                  value={formData.city}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
                  placeholder="Your city"
                />
              </div> */}

              {/* Favorite Cuisine */}
              {/* <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Utensils className="w-4 h-4 inline mr-2" />
                  Favorite Cuisine (Optional)
                </label>
                <select
                  name="cuisine"
                  value={formData.cuisine}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all bg-white"
                >
                  <option value="">Select cuisine</option>
                  <option value="italian">Italian</option>
                  <option value="chinese">Chinese</option>
                  <option value="indian">Indian</option>
                  <option value="mexican">Mexican</option>
                  <option value="japanese">Japanese</option>
                  <option value="thai">Thai</option>
                  <option value="american">American</option>
                  <option value="mediterranean">Mediterranean</option>
                  <option value="other">Other</option>
                </select>
              </div> */}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full btn-primary py-4 text-lg disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Joining...
                </>
              ) : (
                'Join Waitlist'
              )}
            </button>

            <p className="text-center text-gray-500 text-sm mt-4">
              We respect your privacy. No spam, ever.
            </p>
          </form>
        </div>
      </div>
    </section>
  );
}

export default Waitlist;
