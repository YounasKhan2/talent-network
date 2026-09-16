'use client';

import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState } from 'react';

type SectionKey =
  | 'overview'
  | 'experience'
  | 'education'
  | 'skills'
  | 'projects'
  | 'certifications'
  | 'languages'
  | 'links'
  | 'locations'
  | 'custom-sections'
  | 'privacy';

type SectionDefinition = {
  id: SectionKey;
  label: string;
  hideable: boolean;
  collapseWhenEmpty?: boolean;
};

type StoredPreferences = {
  hidden: SectionKey[];
  collapsed: SectionKey[];
};

const STORAGE_KEY = 'talent-network:career-passport:section-ui:v1';

const SECTION_DEFINITIONS: readonly SectionDefinition[] = [
  { id: 'overview', label: 'Professional overview', hideable: false },
  { id: 'experience', label: 'Experience', hideable: false, collapseWhenEmpty: true },
  { id: 'education', label: 'Education', hideable: false, collapseWhenEmpty: true },
  { id: 'skills', label: 'Skills', hideable: false, collapseWhenEmpty: true },
  { id: 'projects', label: 'Projects & portfolio', hideable: true, collapseWhenEmpty: true },
  { id: 'certifications', label: 'Certifications', hideable: false, collapseWhenEmpty: true },
  { id: 'languages', label: 'Languages & interests', hideable: true, collapseWhenEmpty: true },
  { id: 'links', label: 'Professional links', hideable: true, collapseWhenEmpty: true },
  { id: 'locations', label: 'Location preferences', hideable: true, collapseWhenEmpty: true },
  { id: 'custom-sections', label: 'Custom sections', hideable: false, collapseWhenEmpty: true },
  { id: 'privacy', label: 'Privacy & discoverability', hideable: false },
] as const;

const VALID_SECTION_KEYS = new Set<SectionKey>(
  SECTION_DEFINITIONS.map((definition) => definition.id),
);

function isSectionKey(value: unknown): value is SectionKey {
  return typeof value === 'string' && VALID_SECTION_KEYS.has(value as SectionKey);
}

function readStoredPreferences(): StoredPreferences | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { hidden?: unknown; collapsed?: unknown };
    return {
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden.filter(isSectionKey) : [],
      collapsed: Array.isArray(parsed.collapsed) ? parsed.collapsed.filter(isSectionKey) : [],
    };
  } catch {
    return null;
  }
}

export default function CareerSectionControls() {
  const pathname = usePathname();
  const [hidden, setHidden] = useState<SectionKey[]>([]);
  const [collapsed, setCollapsed] = useState<SectionKey[]>([]);
  const [targets, setTargets] = useState<Partial<Record<SectionKey, HTMLElement>>>({});
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [hadStoredPreferences, setHadStoredPreferences] = useState(false);
  const [initializationComplete, setInitializationComplete] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  const hiddenSet = useMemo(() => new Set(hidden), [hidden]);
  const collapsedSet = useMemo(() => new Set(collapsed), [collapsed]);

  useEffect(() => {
    if (pathname !== '/career') return;
    const stored = readStoredPreferences();
    setHadStoredPreferences(Boolean(stored));
    if (stored) {
      setHidden(stored.hidden);
      setCollapsed(stored.collapsed);
      setInitializationComplete(true);
    }
    setPreferencesLoaded(true);
  }, [pathname]);

  useEffect(() => {
    if (pathname !== '/career') {
      setTargets({});
      return;
    }

    let frame = 0;
    const refreshTargets = () => {
      frame = 0;
      const next: Partial<Record<SectionKey, HTMLElement>> = {};
      for (const definition of SECTION_DEFINITIONS) {
        const section = document.getElementById(definition.id);
        const header = section?.querySelector<HTMLElement>('.career-section-header');
        if (header) next[definition.id] = header;
      }
      setTargets((current) => {
        const keys = Object.keys(next) as SectionKey[];
        const currentKeys = Object.keys(current) as SectionKey[];
        if (
          keys.length === currentKeys.length &&
          keys.every((key) => current[key] === next[key])
        ) {
          return current;
        }
        return next;
      });
    };

    const scheduleRefresh = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(refreshTargets);
    };

    scheduleRefresh();
    const observer = new MutationObserver(scheduleRefresh);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [pathname]);

  useEffect(() => {
    if (
      pathname !== '/career' ||
      !preferencesLoaded ||
      hadStoredPreferences ||
      initializationComplete ||
      Object.keys(targets).length === 0
    ) {
      return;
    }

    const defaults = SECTION_DEFINITIONS.filter((definition) => {
      if (!definition.collapseWhenEmpty) return false;
      const section = document.getElementById(definition.id);
      return Boolean(section?.querySelector('.career-empty-copy'));
    }).map((definition) => definition.id);

    setCollapsed(defaults);
    setInitializationComplete(true);
  }, [
    hadStoredPreferences,
    initializationComplete,
    pathname,
    preferencesLoaded,
    targets,
  ]);

  useEffect(() => {
    if (pathname !== '/career' || !preferencesLoaded || !initializationComplete) return;
    const preferences: StoredPreferences = { hidden, collapsed };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }, [collapsed, hidden, initializationComplete, pathname, preferencesLoaded]);

  useEffect(() => {
    if (pathname !== '/career') return;

    for (const definition of SECTION_DEFINITIONS) {
      const section = document.getElementById(definition.id);
      if (!section) continue;
      const isHidden = hiddenSet.has(definition.id);
      const isCollapsed = collapsedSet.has(definition.id);
      section.classList.toggle('career-section-hidden', isHidden);
      section.classList.toggle('career-section-collapsed', isCollapsed);
      section.dataset.sectionCollapsed = String(isCollapsed);

      const navLink = document.querySelector<HTMLElement>(
        `.career-rail nav a[href="#${definition.id}"]`,
      );
      if (navLink) navLink.hidden = isHidden;
    }
  }, [collapsedSet, hiddenSet, pathname, targets]);

  if (pathname !== '/career') return null;

  function toggleCollapsed(id: SectionKey) {
    setCollapsed((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  function toggleHidden(id: SectionKey) {
    setHidden((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  const hideableSections = SECTION_DEFINITIONS.filter((definition) => definition.hideable);

  return (
    <>
      {SECTION_DEFINITIONS.map((definition) => {
        const target = targets[definition.id];
        if (!target) return null;
        const isCollapsed = collapsedSet.has(definition.id);
        return createPortal(
          <div className="career-section-ui-actions" key={definition.id}>
            {definition.hideable ? (
              <button
                className="career-section-hide-button"
                onClick={() => toggleHidden(definition.id)}
                title="Hide this section from your Career Passport editor. Saved data is preserved."
                type="button"
              >
                Remove section
              </button>
            ) : null}
            <button
              aria-expanded={!isCollapsed}
              aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${definition.label}`}
              className="career-section-collapse-button"
              onClick={() => toggleCollapsed(definition.id)}
              type="button"
            >
              <span
                aria-hidden="true"
                className={isCollapsed ? 'career-section-chevron' : 'career-section-chevron is-open'}
              />
            </button>
          </div>,
          target,
        );
      })}

      <div className="career-section-manager">
        {manageOpen ? (
          <div className="career-section-manager-panel" role="dialog" aria-label="Manage sections">
            <div className="career-section-manager-heading">
              <div>
                <strong>Manage sections</strong>
                <span>Hiding a section never deletes its saved data.</span>
              </div>
              <button
                aria-label="Close section manager"
                onClick={() => setManageOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <div className="career-section-manager-list">
              {hideableSections.map((definition) => {
                const isHidden = hiddenSet.has(definition.id);
                return (
                  <div key={definition.id}>
                    <span>{definition.label}</span>
                    <button onClick={() => toggleHidden(definition.id)} type="button">
                      {isHidden ? 'Restore' : 'Hide'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
        <button
          className="career-section-manager-trigger"
          onClick={() => setManageOpen((value) => !value)}
          type="button"
        >
          Manage sections{hidden.length > 0 ? ` · ${hidden.length} hidden` : ''}
        </button>
      </div>
    </>
  );
}
