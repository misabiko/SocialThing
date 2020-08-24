import {expect} from 'chai';
import {Twitter} from '../src/server/routes/twitter';
import {removeTextLink} from '../src/server/twitter';

describe('Twitter', function() {
	describe('tweet text parsing', function() {
		it('should remove urls from tweets', function() {
			//https://twitter.com/RyanSesselman/status/1005510675286896645?s=20
			const sampleTweetText = 'She’s tough. But she’s worth it https://t.co/iBg7XMQdhL';

			expect(removeTextLink(sampleTweetText)).to.eql('She’s tough. But she’s worth it');
		});

		it('should leave text without links as is', function() {
			const sampleTweetText = 'She’s tough. But she’s worth it';

			expect(removeTextLink(sampleTweetText)).to.eql(sampleTweetText);
		});
	});
});