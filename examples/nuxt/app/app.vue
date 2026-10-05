<script setup lang="ts">
const fibber = useFibber();
const { locale, locales, setLocale } = useLocale();

// Without a time zone the server and the browser each format dates in their
// own, and the page would change under the visitor as it hydrates. Settled
// here on the first request, it travels with the selection from then on.
if (fibber.config.timeZone === undefined) {
  fibber.setTimeZone("UTC");
}

// The sections and the plans are data: each carries its messages as keys
// with their values, resolved in the template with `$t(message)`.
const { sections, plans } = useAppConfig();

const name = ref("Ada");
const count = ref(2);
const zones = ["UTC", "America/New_York", "Europe/Paris", "Asia/Tokyo"];

// A fixed instant, so every render of the page formats the same moment.
const at = Date.UTC(2026, 9, 4, 21, 30);

const link = (chunks: string[]) => `<a href="#terms">${chunks.join("")}</a>`;

// The welcome document as Markdown, in the active locale. German has no
// translation of it, so there it is the English source.
const { data: welcome } = await useDocument("welcome.md");
</script>

<template>
  <main>
    <h1>{{ $t.page.title() }}</h1>

    <p>
      <label>
        {{ $t.settings.language() }}
        <select
          :value="locale"
          @change="
            setLocale(
              ($event.target as HTMLSelectElement).value as AppFibberLocale,
            )
          "
        >
          <option v-for="option in locales" :key="option" :value="option">
            {{ fibber.name(option, "language") }}
          </option>
        </select>
      </label>
      <label>
        {{ $t.settings.timeZone() }}
        <select
          :value="fibber.config.timeZone"
          @change="
            fibber.setTimeZone(($event.target as HTMLSelectElement).value)
          "
        >
          <option v-for="zone in zones" :key="zone" :value="zone">
            {{ zone }}
          </option>
        </select>
      </label>
    </p>

    <nav>
      <a
        v-for="section in sections"
        :key="section.id"
        :href="`#${section.id}`"
        :data-test="`nav-${section.id}`"
      >
        {{ $t(section.title) }}
      </a>
    </nav>

    <h2 id="messages">{{ $t.section.messages() }}</h2>
    <p data-test="greeting">
      <input v-model="name" /> {{ $t.account.greeting({ name }) }}
    </p>
    <p data-test="inbox">
      <input v-model.number="count" type="number" min="0" />
      {{ $t.account.inbox({ count }) }}
    </p>
    <p data-test="invite">{{ $t.account.invite({ gender: "female" }) }}</p>
    <p data-test="total">{{ $t.order.total({ amount: 1234.5 }) }}</p>
    <p data-test="updated">{{ $t.order.updated({ at }) }}</p>
    <!-- eslint-disable-next-line vue/no-v-html -- the tag handler's own markup -->
    <p data-test="terms" v-html="$t.legal.terms({ link })" />
    <p data-test="pending">{{ $t.page.pending() }}</p>

    <h2 id="helpers">{{ $t.section.helpers() }}</h2>
    <ul>
      <li data-test="number">{{ fibber.number(1234567.891) }}</li>
      <li data-test="date">{{ fibber.date(at, "full") }}</li>
      <li data-test="relative">{{ fibber.relative(-3, "day") }}</li>
      <li data-test="list">{{ fibber.list(["HTML", "CSS", "JS"]) }}</li>
    </ul>

    <h2 id="plans">{{ $t.section.plans() }}</h2>
    <section
      v-for="plan in plans"
      :key="plan.id"
      :data-test="`plan-${plan.id}`"
    >
      <h3>{{ $t(plan.name) }}</h3>
      <ul>
        <li v-for="(feature, index) in plan.features" :key="index">
          {{ $t(feature) }}
        </li>
      </ul>
    </section>

    <h2 id="content">{{ $t.section.content() }}</h2>
    <pre data-test="content">{{ welcome }}</pre>
  </main>
</template>
