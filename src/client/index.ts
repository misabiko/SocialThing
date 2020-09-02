import Vue from 'vue';
import {FontAwesomeIcon} from '@fortawesome/vue-fontawesome';
import './_bulma_overrides.sass';
import Buefy from 'buefy';
import VueClipboard from 'vue-clipboard2';
// @ts-ignore
import VueMasonry from 'vue-masonry-css';
import App from './components/App.vue';
import {store} from './store';

Vue.component('FontAwesomeIcon', FontAwesomeIcon);

Vue.use(Buefy, {
	defaultIconComponent: 'FontAwesomeIcon',
	defaultIconPack: 'fas',
});

Vue.use(VueClipboard);

Vue.use(VueMasonry);

Vue.config.productionTip = false;

(window as any).SoshalThing = new Vue({
	el: '#soshalThing',
	template: '<App/>',
	components: {App},
	store,
});