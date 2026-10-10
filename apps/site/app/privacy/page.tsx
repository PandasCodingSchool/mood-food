import type { Metadata } from 'next';
import { Nav } from '@/components/Nav';
import { CONTACT_EMAIL } from '@/lib/config';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: 'What MoodFood collects, why, and the choices you have. We never sell your data.',
};

const UPDATED = '10 October 2026';

type Section = { id: string; title: string; paras: string[]; list?: Array<[string, string]> };

// Keep in step with what the app and API actually do. Changes here need a new UPDATED date.
const SECTIONS: Section[] = [
  {
    id: 'who',
    title: 'Who we are',
    paras: [
      "MoodFood (“we”, “us”) is a food recommendation app made in India. Orders, payments and delivery are fulfilled by our partner Swiggy. This policy explains what we collect through the MoodFood app and website, why, and the choices you have. It is written with India's Digital Personal Data Protection Act, 2023 in mind.",
    ],
  },
  {
    id: 'collect',
    title: 'What we collect',
    paras: ['We only collect what we need to recommend food and run your account:'],
    list: [
      ['Account details:', 'your name, and the phone number or email you sign in with.'],
      ['Early-access sign-ups:', 'your name, email and, if you give it, your city.'],
      ['Mood check-ins:', 'your energy, stress, hunger and company ratings, the occasion you pick, and how you felt after a meal.'],
      ['Context:', 'your approximate location, to fetch local weather and nearby restaurants, plus the local time.'],
      ['Swiggy data (only if you link your account):', 'menus, carts, saved addresses and order status. We never receive card or UPI details.'],
      ['App usage:', 'games played, dishes saved or skipped, and basic device information. Our website counts page views without cookies.'],
    ],
  },
  {
    id: 'use',
    title: 'How we use it',
    paras: [
      'To rank dishes for your mood, the weather and the time of day; to place and track orders through Swiggy when you choose to order; to run streaks and quests; to send sign-in codes and early-access emails; and to keep the service secure. We do not use your mood data for advertising outside MoodFood.',
    ],
  },
  {
    id: 'share',
    title: 'Who we share it with',
    paras: ['We do not sell your personal data. We share it only in these cases:'],
    list: [
      ['Swiggy,', 'to place, fulfil and track the orders you choose to make.'],
      ['Service providers', 'such as cloud hosting, email and SMS delivery, under contracts that limit their use of your data.'],
      ['Authorities,', 'when required by law.'],
    ],
  },
  {
    id: 'keep',
    title: 'How long we keep it',
    paras: [
      'Account data, including mood check-ins, is kept while your account is active. When you delete your account, we erase your profile, preferences, history, saved dishes, quests and taste data, and unlink Swiggy, except where the law requires us to keep something longer. Early-access sign-ups are kept until launch, or until you ask us to remove them.',
    ],
  },
  {
    id: 'rights',
    title: 'Your rights',
    paras: [
      `You can access, correct or erase your data, withdraw consent, and nominate someone to exercise these rights on your behalf. You can delete your account and its data at any time in the app under Settings → Account. For anything else, email ${CONTACT_EMAIL} and we will respond within 30 days.`,
    ],
  },
  {
    id: 'security',
    title: 'Security',
    paras: [
      'Data is encrypted in transit, access is limited to people who need it, and we review our systems regularly. No system is perfectly secure, so if a breach affects your data we will notify you and the Data Protection Board of India.',
    ],
  },
  {
    id: 'children',
    title: 'Children',
    paras: ['MoodFood is not intended for anyone under 18. We do not knowingly collect data from children; if we learn we have, we will delete it.'],
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    paras: [
      'If we make material changes, we will notify you in the app or by email before they take effect. The date at the top shows when this policy was last updated.',
    ],
  },
  {
    id: 'contact',
    title: 'Contact & grievances',
    paras: [
      `Questions, requests or complaints: ${CONTACT_EMAIL}. If you are not satisfied with our response, you may approach the Data Protection Board of India.`,
    ],
  },
];

const num = (i: number) => String(i + 1).padStart(2, '0');

export default function Privacy() {
  return (
    <>
      <header className="legal-head">
        <div className="container">
          <Nav current="privacy" cta={false} />
        </div>
        <div className="container legal-intro">
          <p className="eyebrow">{`Legal · Last updated ${UPDATED}`}</p>
          <h1 className="display">Privacy policy</h1>
          <p className="lede">
            The short version: we use your mood, location and orders only to pick better food for you. We never
            sell it. You can see it or delete it whenever you like.
          </p>
        </div>
      </header>

      <main className="paper">
        <div className="container legal">
          <nav className="legal-toc" aria-label="On this page">
            <p className="eyebrow">On this page</p>
            {SECTIONS.map((s, i) => (
              <a key={s.id} href={`#${s.id}`}>
                <span className="legal-n">{num(i)}</span>
                {s.title}
              </a>
            ))}
          </nav>
          <article className="legal-body">
            {SECTIONS.map((s, i) => (
              <section key={s.id} id={s.id}>
                <h2>
                  <span className="legal-n">{num(i)}</span>
                  {s.title}
                </h2>
                {s.paras.map((p) => (
                  <p key={p}>{p}</p>
                ))}
                {s.list ? (
                  <ul>
                    {s.list.map(([b, t]) => (
                      <li key={b}>
                        <strong>{b}</strong> {t}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </article>
        </div>
      </main>
    </>
  );
}
