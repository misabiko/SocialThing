import {Endpoint, Payload, Service} from '@/services/index'
import {Article, LazyMedia, MediaArticle, PlainMedia} from '@/data/articles'
import TweetComponent from '@/components/Articles/TweetArticle.vue'
import TweetArticle from '@/components/Articles/TweetArticle.vue'
import {Filters} from '@/composables/useFilters'
import {h, reactive, ref, toRaw} from 'vue'
import {parseRateLimits, parseResponse, TwitterAPIPayload} from '@/data/TwitterV2'
import {
	TwitterV1APIPayload,
	parseResponse as parseV1Response,
	parseGenericTweet,
	TwitterV1Tweet,
} from '@/data/TwitterV1'

export enum TwitterArticleType {
	Tweet,
	Retweet,
	Quote,
}

export interface TwitterUser {
	id : string
	name : string
	handle : string
	avatarURL : string
}

export interface TwitterArticle extends Article {
	type : TwitterArticleType
	creationDate : Date
	author : TwitterUser
}

export interface TweetArticle extends TwitterArticle, MediaArticle {
	type : TwitterArticleType.Tweet | TwitterArticleType.Quote
	text : string
	media : PlainMedia[] | [LazyMedia]
	liked : boolean
	reposted : boolean
	likeCount : number
	repostCount : number
}

export interface RetweetArticle extends TwitterArticle {
	type : TwitterArticleType.Retweet
	retweetedId : string
}

export interface QuoteArticle extends TweetArticle {
	type : TwitterArticleType.Quote
	quotedId : string
}

export class TwitterService extends Service<TwitterArticle> {
	filters : Filters<TwitterArticle> = {
		Retweet: {
			filter: (inverted) => a => a.type === TwitterArticleType.Retweet != inverted,
			option: () => null,
			defaultConfig: {
				enabled: true,
				inverted: true,
				config: {},
			},
		},
		HasMedia: {
			filter: (inverted) => a => {
				const refId = (a as RetweetArticle).retweetedId ?? (a as QuoteArticle).quotedId
				if (refId)
					return (!!(a as unknown as MediaArticle).media?.length || !!(this.articles.value[refId] as unknown as MediaArticle).media?.length) != inverted
				else
					return !!(a as unknown as MediaArticle).media?.length != inverted
			},
			option: () => null,
			defaultConfig: {
				enabled: true,
				inverted: false,
				config: {},
			},
		},
	}

	constructor() {
		super('Twitter', {
			[UserTimelineEndpoint.name]: {
				factory({userId} : { userId : string }) {
					return new UserTimelineEndpoint(userId)
				},
				optionComponent(props : any, {emit}: {emit: any}) {
					return h('div', {class: 'field'}, [
						h('label', {class: 'field-label'}, 'User Id'),
						h('div', {class: 'control'},
							h('input', {
								class: 'input',
								type: 'text',
								value: props.endpointOptions.userId,
								onInput: (e : InputEvent) => {
									props.endpointOptions.userId = (e.target as HTMLInputElement).value
									emit('changeOptions', props.endpointOptions)
								},
							}),
						),
					])
				},
			},
			[UserTimelineV1Endpoint.name]: {
				factory({userId} : { userId : string }) {
					return new UserTimelineV1Endpoint(userId)
				},
				optionComponent(props : any, {emit}: {emit: any}) {
					return h('div', {class: 'field'}, [
						h('label', {class: 'field-label'}, 'User Id'),
						h('div', {class: 'control'},
							h('input', {
								class: 'input',
								type: 'text',
								value: props.endpointOptions.userId,
								onInput: (e : InputEvent) => {
									props.endpointOptions.userId = (e.target as HTMLInputElement).value
									emit('changeOptions', props.endpointOptions)
								},
							}),
						),
					])
				},
			},
			[HomeTimelineEndpoint.name]: {
				factory() {
					return new HomeTimelineEndpoint()
				},
				optionComponent() {
					return null
				},
			},
			[SearchEndpoint.name]: {
				factory({query} : { query : string }) {
					return new SearchEndpoint(query)
				},
				optionComponent(props : any, {emit}: {emit: any}) {
					return h('div', {class: 'field'}, [
						h('label', {class: 'field-label'}, 'Query'),
						h('div', {class: 'control'},
							h('input', {
								class: 'input',
								type: 'text',
								value: props.endpointOptions.query,
								onInput: (e : InputEvent) => {
									props.endpointOptions.query = (e.target as HTMLInputElement).value
									emit('changeOptions', props.endpointOptions)
								},
							}),
						),
					])
				},
			},
		}, TweetComponent, true)

		//this.endpoints.push(new SearchEndpoint('-is:retweet #深夜の真剣お絵描き60分一本勝負 OR -is:retweet #東方の90分お絵描き OR -is:retweet #東方ワンドロバトル'))
	}

	getAPIArticleData(id : string) : Promise<any> {
		return Promise.resolve(undefined)
	}

	getExternalLink(id : string) : string {
		const {id: tweetId, author} = this.articles.value[id]
		return `https://twitter.com/${author.handle}/status/${tweetId}`
	}

	getUserURL(handle : string) {
		return 'https://twitter.com/' + handle
	}

	async like(id : string) {
		const article = this.articles.value[id]
		if (!article || article.type == TwitterArticleType.Retweet)
			return

		const params = new URLSearchParams()
		params.set('id', id)
		params.set('tweet_mode', 'extended')

		const response = await fetch(`/twitter/v1/favorites/${(article as TweetArticle).liked ? 'destroy' : 'create'}?${params.toString()}`, {method: 'POST'})
			.then(r => r.json())
		console.dir(response)

		if (response.statuses) {
			const payload = parseV1Response(response)

			for (const a of payload.articles)
				this.updateArticle(a)
		}else if (response.errors?.find((e: {code: number}) => e.code == 139))	//tweet already liked
			(this.articles.value[id] as TweetArticle).liked = true
	}

	async retweet(id : string) {
		const article = this.articles.value[id]
		if (!article || article.type == TwitterArticleType.Retweet || (article as TweetArticle).reposted)
			return

		const params = new URLSearchParams()
		params.set('id', id)
		params.set('tweet_mode', 'extended')

		const response = await fetch(`/twitter/retweet?${params.toString()}`, {method: 'POST'})
			.then(r => r.json())
		console.dir(response)

		if ((response as TwitterV1Tweet).id_str) {
			const payload = parseGenericTweet(response)

			for (const a of payload.articles)
				this.updateArticle(a)
		}else if (response.errors?.find((e: {code: number}) => e.code == 327))	//tweet already retweeted
			(this.articles.value[id] as TweetArticle).reposted = true
	}

	logArticle(id : string) {
		const article = this.articles.value[id]
		switch (article.type) {
			case TwitterArticleType.Tweet:
				return super.logArticle(id)
			case TwitterArticleType.Retweet:
				return console.dir({article: toRaw(article), actualArticle: toRaw(this.articles.value[(article as RetweetArticle).retweetedId])})
			case TwitterArticleType.Quote:
				return console.dir({article: toRaw(article), actualArticle: toRaw(this.articles.value[(article as QuoteArticle).quotedId])})
		}
	}
}

interface UserTimelineCallOpt {
	fromEnd: boolean
}

class UserTimelineEndpoint extends Endpoint<UserTimelineCallOpt> {
	rateLimitInfo = reactive({
		maxCalls: 900,
		remainingCalls: 1,
		secUntilNextReset: Date.now() / 1000 + 15 * 60,
	})

	constructor(readonly userId : string) {
		super('User Timeline ' + userId)
	}

	get ready() : boolean {
		return super.ready && !!this.rateLimitInfo.remainingCalls
	}

	async call(options : UserTimelineCallOpt) : Promise<Payload> {
		const params = new URLSearchParams()
		params.set('tweet.fields', 'created_at,public_metrics,referenced_tweets,entities,attachments')
		params.set('user.fields', 'name,username,profile_image_url')
		params.set('media.fields', 'width,height,preview_image_url,url')
		params.set('expansions', 'author_id,referenced_tweets.id,referenced_tweets.id.author_id,attachments.media_keys')
		params.set('max_results', '100')
		if (options.fromEnd && this.articles.length)
			params.set('until_id', this.articles[this.articles.length - 1])

		const response : TwitterAPIPayload = await fetch(`/twitter/users/${this.userId}?${params.toString()}`).then(r => r.json())
		console.dir(response)

		const payload = parseResponse(response)

		this.rateLimitInfo.remainingCalls--
		parseRateLimits(this, response)

		for (const id of payload.newArticles)
			if (!this.articles.includes(id))
				this.articles.push(id)

		return payload
	}

	getKeyOptions() {
		return {
			endpointType: this.constructor.name,
			userId: this.userId,
		}
	}
}

interface UserTimelineV1CallOpt {
	fromEnd: boolean
}

export class UserTimelineV1Endpoint extends Endpoint<UserTimelineCallOpt> {
	rateLimitInfo = reactive({
		maxCalls: 900,
		remainingCalls: 1,
		secUntilNextReset: Date.now() / 1000 + 15 * 60,
	})

	constructor(readonly userId : string) {
		super('User Timeline V1 ' + userId)
	}

	get ready() : boolean {
		return super.ready && !!this.rateLimitInfo.remainingCalls
	}

	async call(options : UserTimelineCallOpt) : Promise<Payload> {
		const params = new URLSearchParams()
		params.set('tweet_mode', 'extended')
		params.set('user_id', this.userId)
		params.set('count', '200')
		if (options.fromEnd && this.articles.length)
			params.set('max_id', this.articles[this.articles.length - 1])

		const response : TwitterV1APIPayload = await fetch(`/twitter/v1/statuses/user_timeline?${params.toString()}`).then(r => r.json())
		console.dir(response)

		this.rateLimitInfo.remainingCalls--
		parseRateLimits(this, response)

		const payload = parseV1Response(response)

		for (const id of payload.newArticles)
			if (!this.articles.includes(id))
				this.articles.push(id)

		return payload
	}

	getKeyOptions() {
		return {
			endpointType: this.constructor.name,
			userId: this.userId,
		}
	}
}

interface HomeTimelineCallOpt {
	fromEnd: boolean
}

class HomeTimelineEndpoint extends Endpoint<HomeTimelineCallOpt> {
	rateLimitInfo = reactive({
		maxCalls: 15,
		remainingCalls: 1,
		secUntilNextReset: Date.now() / 1000 + 15 * 60,
	})

	constructor() {
		super('Home Timeline')
	}

	get ready() : boolean {
		return super.ready && !!this.rateLimitInfo.remainingCalls
	}

	async call(options : UserTimelineCallOpt) : Promise<Payload> {
		const params = new URLSearchParams()
		params.set('count', '200')
		params.set('tweet_mode', 'extended')
		if (options.fromEnd && this.articles.length)
			params.set('max_id', this.articles[this.articles.length - 1])

		const response : TwitterV1APIPayload = await fetch(`/twitter/v1/statuses/home_timeline?${params.toString()}`).then(r => r.json())
		console.dir(response)

		this.rateLimitInfo.remainingCalls--
		parseRateLimits(this, response)

		const payload = parseV1Response(response)

		for (const id of payload.newArticles)
			if (!this.articles.includes(id))
				this.articles.push(id)

		return payload
	}

	getKeyOptions() {
		return {endpointType: this.constructor.name}
	}
}

interface SearchCallOpt {
	fromEnd: boolean
}

class SearchEndpoint extends Endpoint<SearchCallOpt> {
	rateLimitInfo = reactive({
		maxCalls: 180,
		remainingCalls: 1,
		secUntilNextReset: Date.now() / 1000 + 15 * 60,
	})

	constructor(readonly query : string) {
		super('Search ' + query)
	}

	get ready() : boolean {
		return super.ready && !!this.rateLimitInfo.remainingCalls
	}

	async call(options : SearchCallOpt) : Promise<Payload> {
		const params = new URLSearchParams()
		params.set('query', this.query)
		params.set('max_results', '100')
		params.set('tweet.fields', 'created_at,public_metrics,referenced_tweets,entities,attachments')
		params.set('user.fields', 'name,username,profile_image_url')
		params.set('media.fields', 'width,height,preview_image_url,url')
		params.set('expansions', 'author_id,referenced_tweets.id,referenced_tweets.id.author_id,attachments.media_keys')
		if (options.fromEnd && this.articles.length)
			params.set('until_id', this.articles[this.articles.length - 1])

		const response : TwitterAPIPayload = await fetch(`/twitter/search?${params.toString()}`)
			.then(r => r.json())
			.catch(e => console.error('Failed to parse search response', e))
		console.dir(response)

		this.rateLimitInfo.remainingCalls--
		parseRateLimits(this, response)

		const payload = parseResponse(response)

		this.updateInstance(options, payload)

		return payload
	}

	updateInstance(options : SearchCallOpt, payload : Payload) {
		for (const id of payload.newArticles)
			if (!this.articles.includes(id))
				this.articles.push(id)
	}

	getKeyOptions() {
		return {
			endpointType: this.constructor.name,
			query: this.query,
		}
	}
}