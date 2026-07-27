// file: lib/vivreStudy.js

const STORAGE_KEY = "vivreStudy";

function createEmptyData() {
  return {
    profiles: {},
    total: {
      correct: 0,
      wrong: 0,
    },
  };
}

export function loadStudy() {
  if (typeof window === "undefined") {
    return createEmptyData();
  }

  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      return createEmptyData();
    }

    const data = JSON.parse(saved);

    if (!data.profiles) {
      data.profiles = {};
    }

    if (!data.total) {
      data.total = {
        correct: 0,
        wrong: 0,
      };
    }

    return data;
  } catch {
    return createEmptyData();
  }
}

export function saveStudy(data) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(data)
  );
}

function createProfile() {
  return {
    age: {
      correct: 0,
      wrong: 0,
    },

    height: {
      correct: 0,
      wrong: 0,
    },

    blood: {
      correct: 0,
      wrong: 0,
    },

    lastWrong: null,
  };
}

export function saveAnswer(
  number,
  type,
  correct
) {
  const data = loadStudy();

  if (!data.profiles[number]) {
    data.profiles[number] =
      createProfile();
  }

  if (correct) {

    data.profiles[number][type].correct++;

    data.total.correct++;

  } else {

    data.profiles[number][type].wrong++;

    data.profiles[number].lastWrong =
      Date.now();

    data.total.wrong++;

  }

  saveStudy(data);
}

export function getProfile(number) {
  const data = loadStudy();

  if (!data.profiles[number]) {
    return createProfile();
  }

  return data.profiles[number];
}

export function getAccuracy(number, type) {

  const profile =
    getProfile(number);

  const item =
    profile[type];

  const total =
    item.correct + item.wrong;

  if (total === 0) {
    return 0;
  }

  return Math.round(
    item.correct /
      total *
      100
  );
}

export function getWeakProfiles(
  profiles,
  type,
  maxRate = 50
) {

  return profiles.filter(profile =>

    getAccuracy(
      profile.number,
      type
    ) <= maxRate

  );

}

export function getRecentlyWrong(
  profiles,
  limit = 30
) {

  return [...profiles]

    .filter(profile => {

      const data =
        getProfile(profile.number);

      return data.lastWrong;

    })

    .sort((a, b) =>

      getProfile(b.number).lastWrong -
      getProfile(a.number).lastWrong

    )

    .slice(0, limit);

}

export function resetStudy() {

  localStorage.removeItem(
    STORAGE_KEY
  );

}