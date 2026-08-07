const mediaQuery = matchMedia('(prefers-reduced-motion: reduce)');
let observer = null;
const chapterElements = document.querySelectorAll('.chapter-row');

function revealChapter(el) {
  if (el.classList.contains('is-revealed')) return;
  el.classList.add('is-revealed');
  observer?.unobserve(el);
}

function updateObserver() {
  if (mediaQuery.matches) {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    document.documentElement.classList.remove('is-enhanced');
    chapterElements.forEach((el) => el.classList.add('is-revealed'));
    return;
  }

  document.documentElement.classList.add('is-enhanced');

  if (!observer) {
    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          revealChapter(entry.target);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -40px 0px',
    });

    chapterElements.forEach((el) => {
      if (!el.classList.contains('is-revealed')) {
        observer.observe(el);
      }
    });
  }
}

updateObserver();

mediaQuery.addEventListener('change', updateObserver);
