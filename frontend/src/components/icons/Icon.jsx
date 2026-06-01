import * as moodIcons from '../../assets/icons/moods';
import * as cravingIcons from '../../assets/icons/cravings';
import * as budgetIcons from '../../assets/icons/budget';
import * as preferenceIcons from '../../assets/icons/preferences';
import * as storyIcons from '../../assets/icons/story';
import * as foodIcons from '../../assets/icons/food';

const REGISTRY = {
  moods: moodIcons,
  cravings: cravingIcons,
  budget: budgetIcons,
  preferences: preferenceIcons,
  story: storyIcons,
  food: foodIcons,
};

const QUIZ_CATEGORY = {
  mood: 'moods',
  craving: 'cravings',
  budget: 'budget',
  preference: 'preferences',
};

const FOLLOW_UP_CATEGORY = {
  craving: 'cravings',
  budget: 'budget',
  preference: 'preferences',
};

/**
 * @param {'moods'|'cravings'|'budget'|'preferences'|'story'|'food'} category
 * @param {string} name — slug key within category
 * @param {number} [size=48]
 * @param {string} [className]
 */
export default function Icon({ category, name, size = 48, className = '' }) {
  const set = REGISTRY[category];
  const Component = set?.[name];
  if (!Component) {
    return null;
  }
  return <Component size={size} className={className} />;
}

export function MoodIcon({ mood, size = 48, className = '' }) {
  return <Icon category="moods" name={mood} size={size} className={className} />;
}

export function StoryIcon({ name, size = 40, className = '' }) {
  return <Icon category="story" name={name} size={size} className={className} />;
}

export function QuizOptionIcon({ questionKey, option, size = 48, className = '' }) {
  const category = QUIZ_CATEGORY[questionKey];
  if (!category || !option?.icon) return null;
  return <Icon category={category} name={option.icon} size={size} className={className} />;
}

export function FollowUpOptionIcon({ field, option, size = 44, className = '' }) {
  const category = FOLLOW_UP_CATEGORY[field];
  if (!category || !option?.icon) return null;
  return <Icon category={category} name={option.icon} size={size} className={className} />;
}

export function BlendMoodIcons({ inputMoods, resultIcon, size = 40, className = '' }) {
  return (
    <div className={`inline-flex items-center justify-center gap-2 ${className}`}>
      {inputMoods?.map((m) => (
        <MoodIcon key={m.value} mood={m.icon ?? m.value} size={size} title={m.label} />
      ))}
      <span className="text-gray-400 text-lg" aria-hidden>
        →
      </span>
      <MoodIcon mood={resultIcon} size={size} />
    </div>
  );
}
