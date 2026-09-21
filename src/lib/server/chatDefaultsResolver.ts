import { parseSamplingOptions, type SamplingOptions } from '$lib/chat/options';
import { getConfig } from '$lib/server/db/config';
import { resolveShared, type Sharing } from '$lib/server/sharing';
import { DEFAULT_SETTINGS, type Settings } from '$lib/settings';

export interface ResolvedChatDefaults {
	defaultModel: {
		value: string;
		editable: boolean;
		source: 'admin' | 'user';
		adminValue: string;
	};
	title: {
		generateTitlesWithAI: boolean;
		titleModel: string;
		titleServerId: string;
		regenerateTitle: boolean;
		regenerateTitleAfter: number;
		editable: boolean;
		source: 'admin' | 'user';
		admin: {
			generateTitlesWithAI: boolean;
			titleModel: string;
			titleServerId: string;
			regenerateTitle: boolean;
			regenerateTitleAfter: number;
		};
	};
	compact: {
		compactModel: string;
		compactServerId: string;
		autoCompact: boolean;
		compactThreshold: number;
		editable: boolean;
		source: 'admin' | 'user';
		admin: {
			compactModel: string;
			compactServerId: string;
			autoCompact: boolean;
			compactThreshold: number;
		};
	};
	/** In this resolver rather than one of its own: the question is the same one, which model an account uses for a job it did not choose a model for, and who decides. */
	images: {
		defaultImageModel: string;
		imagePromptWriter: boolean;
		imagePromptModel: string;
		editable: boolean;
		source: 'admin' | 'user';
		admin: { defaultImageModel: string; imagePromptWriter: boolean; imagePromptModel: string };
	};
	/** Same reason as the images group. An administrator who has set up a transcription model is usually the only person who could have, so sharing it is the difference between a feature everybody has and one only they have. */
	voice: {
		voiceInput: boolean;
		voiceModel: string;
		editable: boolean;
		source: 'admin' | 'user';
		admin: { voiceInput: boolean; voiceModel: string };
	};
	/**
	 * The sampling every conversation on this account starts from, shared the same
	 * three ways as everything else here.
	 *
	 * The values are only ever typed in Settings; the Admin tab holds the sharing
	 * choice, and the snapshot is the administrator's own set as it stood then.
	 * Nothing is published by merely existing: `off` keeps their numbers personal.
	 */
	sampling: {
		value: SamplingOptions;
		editable: boolean;
		source: 'admin' | 'user';
		adminValue: SamplingOptions;
	};
}

/** Each of these is independently off / locked / overridable. The admin's values are a snapshot in app_config; admins always see their own, editable. */
export function resolveChatDefaults(
	userSettings: Settings | null,
	isAdmin: boolean
): ResolvedChatDefaults {
	const sharingOf = (key: string) => (getConfig(key) as Sharing) || 'off';

	/** Unlike `resolveShared`'s own `adminValue`, the admin's snapshot is reported in every state, off included. The group's model is its sentinel: an account that has chosen one has an opinion, one that has not takes the instance's. */
	function group<T extends object>(own: T, admin: T, sharingKey: string, model: keyof T) {
		const { value, editable, source } = resolveShared({
			own,
			admin: () => admin,
			empty: admin,
			sharing: sharingOf(sharingKey),
			isAdmin,
			hasContent: (candidate) => !!candidate[model]
		});
		return { ...value, editable, source, admin };
	}

	const defaultModel = resolveShared({
		own: userSettings?.defaultModel ?? '',
		admin: () => getConfig('defaultModel') ?? '',
		empty: '',
		sharing: sharingOf('defaultModelSharing'),
		isAdmin,
		hasContent: (value) => !!value
	});

	const title = group(
		{
			generateTitlesWithAI: userSettings?.generateTitlesWithAI ?? false,
			titleModel: userSettings?.titleModel ?? '',
			titleServerId: '',
			regenerateTitle: userSettings?.regenerateTitle ?? DEFAULT_SETTINGS.regenerateTitle,
			regenerateTitleAfter:
				userSettings?.regenerateTitleAfter ?? DEFAULT_SETTINGS.regenerateTitleAfter
		},
		{
			generateTitlesWithAI: getConfig('titleEnabled') === 'true',
			titleModel: getConfig('titleModel') ?? '',
			titleServerId: getConfig('titleServerId') ?? '',
			regenerateTitle: getConfig('titleRegenerate') === 'true',
			regenerateTitleAfter: Number(
				getConfig('titleRegenerateAfter') ?? DEFAULT_SETTINGS.regenerateTitleAfter
			)
		},
		'titleSharing',
		'titleModel'
	);

	const compact = group(
		{
			compactModel: userSettings?.compactModel ?? '',
			compactServerId: '',
			autoCompact: userSettings?.autoCompact ?? DEFAULT_SETTINGS.autoCompact,
			compactThreshold: userSettings?.compactThreshold ?? DEFAULT_SETTINGS.compactThreshold
		},
		{
			compactModel: getConfig('compactModel') ?? '',
			compactServerId: getConfig('compactServerId') ?? '',
			autoCompact: getConfig('compactAuto') === 'true',
			compactThreshold: Number(getConfig('compactThreshold') ?? DEFAULT_SETTINGS.compactThreshold)
		},
		'compactSharing',
		'compactModel'
	);

	const images = group(
		{
			defaultImageModel: userSettings?.defaultImageModel ?? '',
			imagePromptWriter: userSettings?.imagePromptWriter ?? DEFAULT_SETTINGS.imagePromptWriter,
			imagePromptModel: userSettings?.imagePromptModel ?? ''
		},
		{
			defaultImageModel: getConfig('defaultImageModel') ?? '',
			imagePromptWriter: getConfig('imagePromptWriter') !== 'false',
			imagePromptModel: getConfig('imagePromptModel') ?? ''
		},
		'imagesSharing',
		'defaultImageModel'
	);

	const voice = group(
		{
			voiceInput: userSettings?.voiceInput ?? DEFAULT_SETTINGS.voiceInput,
			voiceModel: userSettings?.voiceModel ?? ''
		},
		{
			voiceInput: getConfig('voiceInput') === 'true',
			voiceModel: getConfig('voiceModel') ?? ''
		},
		'voiceSharing',
		'voiceModel'
	);

	// Not a merge: the first number an account types makes the whole set its own,
	// since half a temperature from one place and half a top-k from another is a
	// combination nobody chose.
	const adminSampling = parseSamplingOptions(getConfig('sampling'));
	const sampling = resolveShared({
		own: parseSamplingOptions(userSettings?.sampling),
		admin: () => adminSampling,
		empty: adminSampling,
		sharing: sharingOf('samplingSharing'),
		isAdmin,
		hasContent: (value) => Object.keys(value).length > 0
	});

	return {
		defaultModel: {
			value: defaultModel.value,
			editable: defaultModel.editable,
			source: defaultModel.source,
			adminValue: defaultModel.adminValue
		},
		title,
		compact,
		images,
		voice,
		sampling: {
			value: sampling.value,
			editable: sampling.editable,
			source: sampling.source,
			adminValue: sampling.adminValue
		}
	};
}
