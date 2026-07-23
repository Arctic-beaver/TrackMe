import { useContext } from 'react'
import { LocalizationContext, type LocalizationContextValue } from './localizationContext'

export function useLocalization(): LocalizationContextValue {
	return useContext(LocalizationContext)
}
