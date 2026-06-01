import { useState, useEffect } from 'react';
import { Mail, User, MapPin, Utensils, CheckCircle, Loader2 } from 'lucide-react';
import AnimateIn from './AnimateIn';
import { trackEvent } from '../utils/analytics';
import {
  isWaitlistJoined,
  markWaitlistJoined,
  submitWaitlist,
} from '../utils/waitlist';

function Waitlist({ joined: joinedProp, onJoined }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    city: '',
    cuisine: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (joinedProp || isWaitlistJoined()) {
      setIsSubmitted(true);
    }
  }, [joinedProp]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    trackEvent('waitlist_join_attempted', { ...formData, entry: 'full_form' });

    try {
      await submitWaitlist(formData);
      trackEvent('waitlist_joined', { ...formData, entry: 'full_form' });
      markWaitlistJoined();
      setIsSubmitted(true);
      onJoined?.();
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
      trackEvent('waitlist_error', { entry: 'full_form', error: err.message });
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
      <section id="waitlist" className="py-16 bg-secondary-50/30 border-t border-secondary-200">
        <div className="section-container">
          <AnimateIn variant="scale" className="max-w-lg mx-auto text-center surface p-8 border-secondary-200">
            <div className="w-14 h-14 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-success-pop">
              <CheckCircle className="w-8 h-8 text-primary-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">
              You&apos;re on the list
            </h2>
            <p className="text-slate-600 font-sans">
              Thanks for joining. We&apos;ll notify you when we launch in your city.
            </p>
          </AnimateIn>
        </div>
      </section>
    );
  }

  return (
    <section id="waitlist" className="py-16 bg-secondary-50/30 border-t border-secondary-200">
      <div className="section-container">
        <div className="max-w-lg mx-auto">
          <AnimateIn className="mb-8 md:text-left text-center">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">
              Complete your signup
            </h2>
            <p className="text-slate-600 text-sm font-sans">
              Add your name and city so we can personalize your launch invite.
            </p>
          </AnimateIn>

          <AnimateIn delay={100} variant="slide-up">
          <form onSubmit={handleSubmit} className="surface p-6 md:p-8 border-2 border-primary-100 shadow-sm bg-white">
            {error && (
              <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <User className="w-4 h-4 inline mr-2" />
                  Name *
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all bg-white"
                  placeholder="Your name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <Mail className="w-4 h-4 inline mr-2" />
                  Email *
                </label>
                <input
                  type="email"
                  name="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all bg-white"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <MapPin className="w-4 h-4 inline mr-2" />
                  City *
                </label>
                <input
                  type="text"
                  name="city"
                  required
                  value={formData.city}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all bg-white"
                  placeholder="Your city"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <Utensils className="w-4 h-4 inline mr-2" />
                  Favorite cuisine (optional)
                </label>
                <select
                  name="cuisine"
                  value={formData.cuisine}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none bg-white"
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
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full btn-primary py-3.5 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Joining...
                </>
              ) : (
                'Join waitlist'
              )}
            </button>

            <p className="text-center text-slate-500 text-xs mt-4">
              We respect your privacy. No spam, ever.
            </p>
          </form>
          </AnimateIn>
        </div>
      </div>
    </section>
  );
}

export default Waitlist;
