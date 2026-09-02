<template>
  <div class="landing">
    <div class="landing__card">
      <div class="landing__container">
        <div class="landing__content">
          <h1 class="landing__title">ATLAS</h1>

          <div class="landing__description">
            <p>
              ATLAS is an open source application developed as a part of
              <a href="https://ohdsi.org" target="_blank" class="landing__link">OHDSI</a>
              intended to provide a unified interface to patient level data and analytics.
            </p>
          </div>

          <div class="landing__documentation">
            <h2 class="landing__section-title">Documentation</h2>
            <p>
              The ATLAS user guide can be found
              <a href="https://data2evidence.org/docs/" class="landing__link" target="_blank">here</a>.
            </p>
          </div>

          <div class="landing__actions">
            <button class="landing__button landing__button--outline" @click="handleSearchConcepts">
              Search Concepts
            </button>
            <button class="landing__button landing__button--secondary" @click="handleNewCohort">New Cohort</button>
          </div>
        </div>

        <div class="landing__illustration">
          <img :src="atlasLogo" alt="ATLAS" class="landing__logo" />
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import atlasLogo from '@/assets/atlas-loading.svg'
import { navigateToRoute } from '../utils/AppRegistry'

export default {
  name: 'Landing',
  data() {
    return {
      atlasLogo,
    }
  },
  methods: {
    handleSearchConcepts() {
      navigateToRoute('/concepts')
    },
    handleNewCohort() {
      navigateToRoute('/cohorts')
    },
  },
}
</script>

<style lang="scss" scoped>
.landing {
  min-height: 100%;
  background-color: var(--color-neutral-lightest, #f2f0f1);
  color: var(--d2e-color-primary, #000080);
  display: flex;
  padding: 32px;
  font-size: 16px;
  box-sizing: border-box;
}

.landing__card {
  border-radius: 18px;
  padding: 30px;
  background-color: white;
  width: 100%;
}

.landing__container {
  margin: 30px auto;
  max-width: 940px;
  display: grid;
  grid-template-columns: 1fr 400px;
  gap: 2rem;
}

.landing__content {
  padding-right: 2rem;
}

.landing__title {
  font-size: 4rem;
  font-weight: 300;
  margin: 0 0 2rem 0;
  letter-spacing: 0.2em;
}

.landing__description {
  margin-bottom: 3rem;

  p {
    line-height: 1.6;
    margin: 0;
  }
}

.landing__link {
  color: var(--d2e-color-primary, #000080);
  text-decoration: underline;

  &:hover {
    color: var(--color-primary-light, #333399);
  }
}

.landing__documentation {
  margin-bottom: 3rem;

  p {
    margin: 0;
  }
}

.landing__section-title {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0 0 1rem 0;
}

.landing__actions {
  display: flex;
  gap: 1rem;
}

.landing__button {
  padding: 0.75rem 1.5rem;
  min-width: 180px;
  font-size: 16px;
  font-weight: 500;
  border-radius: 4px;
  border: 2px solid var(--d2e-color-primary, #000080);
  cursor: pointer;
  transition: all 0.2s ease-in-out;
  text-decoration: none;
  display: inline-block;
  text-align: center;

  &--outline {
    background-color: transparent;
    color: var(--d2e-color-primary, #000080);
  }

  &--secondary {
    color: var(--d2e-color-primary, #000080);
    border-color: var(--color-support-orange, #eb6622);
    background-color: white;
  }
}

.landing__illustration {
  display: flex;
  justify-content: center;
  align-items: center;
}

.landing__logo {
  max-width: 100%;
  height: auto;
  width: 400px;
}

@media (max-width: 768px) {
  .landing__container {
    grid-template-columns: 1fr;
    gap: 2rem;
    text-align: center;
  }

  .landing__content {
    padding-right: 0;
  }

  .landing__title {
    font-size: 3rem;
  }

  .landing__actions {
    justify-content: center;
  }

  .landing__logo {
    width: 300px;
  }
}

@media (max-width: 480px) {
  .landing {
    padding: 1rem;
  }

  .landing__title {
    font-size: 2.5rem;
  }

  .landing__actions {
    flex-direction: column;
  }

  .landing__button {
    width: 100%;
  }
}
</style>
